import type { GenerationParameters } from '@malang/shared'
import { and, asc, eq } from 'drizzle-orm'

import { generationRuns } from '../schema'
import { iso, RepositoryBase } from './base'

export class GenerationRepository extends RepositoryBase {
    recoverInterrupted(): void {
        const now = Date.now()
        this.sqlite.transaction(() => {
            this.sqlite
                .query(`
            UPDATE messages
            SET status = 'cancelled', updated_at = ?
            WHERE status = 'streaming'
              AND id IN (SELECT message_id FROM generation_runs WHERE status = 'running')
          `)
                .run(now)
            this.sqlite
                .query(`
            UPDATE generation_runs
            SET status = 'cancelled', error_code = 'cancelled',
                error_message = 'Server stopped during generation', completed_at = ?
            WHERE status = 'running'
          `)
                .run(now)
        })()
    }

    hasAnyRunning(): boolean {
        return !!this.db
            .select({ id: generationRuns.id })
            .from(generationRuns)
            .where(eq(generationRuns.status, 'running'))
            .limit(1)
            .get()
    }

    findRunning(conversationId: string) {
        return this.db
            .select()
            .from(generationRuns)
            .where(
                and(
                    eq(generationRuns.conversationId, conversationId),
                    eq(generationRuns.status, 'running'),
                ),
            )
            .get()
    }

    active(conversationId: string) {
        const row = this.findRunning(conversationId)
        return row ? mapGenerationRun(row) : null
    }

    requestLogs(cutoffRowId: number, limit = 200) {
        return this.sqlite
            .query<RequestLogRow, [number, number]>(
                `SELECT g.id, g.conversation_id, c.title AS conversation_title,
                        g.status, g.provider, g.model_id, g.input_tokens, g.output_tokens,
                        g.error_code, g.error_message, g.started_at, g.completed_at,
                        EXISTS(SELECT 1 FROM request_debug_records r WHERE r.generation_id = g.id)
                            AS has_details
                 FROM generation_runs g
                 LEFT JOIN conversations c ON c.id = g.conversation_id
                 WHERE g.rowid > ?
                 ORDER BY g.started_at DESC LIMIT ?`,
            )
            .all(cutoffRowId, Math.max(1, Math.min(limit, 500)))
            .map(mapRequestLog)
    }

    requestLogCursor(): number {
        return (
            this.sqlite
                .query<{ cursor: number | null }, []>(
                    'SELECT MAX(rowid) AS cursor FROM generation_runs',
                )
                .get()?.cursor ?? 0
        )
    }

    requestLogDetail(id: string) {
        const run = this.sqlite
            .query<RequestLogDetailRow, [string]>(
                `SELECT g.id, g.conversation_id, c.title AS conversation_title,
                        g.status, g.provider, g.model_id, g.input_tokens, g.output_tokens,
                        g.error_code, g.error_message, g.started_at, g.completed_at,
                        g.output_text, g.processed_output_text
                 FROM generation_runs g
                 LEFT JOIN conversations c ON c.id = g.conversation_id
                 WHERE g.id = ?`,
            )
            .get(id)
        if (!run) return null
        const requests = this.sqlite
            .query<{ request_json: string; parameters_json: string }, [string]>(
                `SELECT request_json, parameters_json FROM request_debug_records
                 WHERE generation_id = ? ORDER BY created_at`,
            )
            .all(id)
            .map((row) => ({
                request: parseJson(row.request_json),
                parameters: parseJson(row.parameters_json),
            }))
        return {
            ...mapRequestLog(run),
            response: run.processed_output_text || run.output_text,
            requests,
        }
    }

    usage() {
        const rows = this.sqlite
            .query<UsageRow, []>(
                `SELECT provider, model_id, status, input_tokens, output_tokens,
                        started_at, completed_at
                 FROM generation_runs`,
            )
            .all()
        const totals = aggregateUsage(rows)
        const models = [...groupUsage(rows, (row) => `${row.provider}\u0000${row.model_id}`)]
            .map(([key, grouped]) => {
                const [provider, modelId] = key.split('\u0000')
                return { provider, modelId, ...aggregateUsage(grouped) }
            })
            .sort((left, right) => right.requests - left.requests)
        const days = [...groupUsage(rows, (row) => localDay(row.started_at))]
            .map(([date, grouped]) => ({ date, ...aggregateUsage(grouped) }))
            .sort((left, right) => left.date.localeCompare(right.date))
            .slice(-18)
        return {
            totals,
            days,
            models,
            sources: [{ source: 'chat', ...totals }],
        }
    }

    findByIdempotency(conversationId: string, key: string) {
        return this.db
            .select()
            .from(generationRuns)
            .where(
                and(
                    eq(generationRuns.conversationId, conversationId),
                    eq(generationRuns.idempotencyKey, key),
                ),
            )
            .get()
    }

    create(input: {
        id: string
        conversationId: string
        messageId: string | null
        idempotencyKey: string
        provider: string
        modelId: string
        parameters: GenerationParameters
    }): void {
        this.db
            .insert(generationRuns)
            .values({
                ...input,
                status: 'running',
                parametersJson: input.parameters,
                outputText: '',
                processedOutputText: '',
                startedAt: new Date(),
            })
            .run()
    }

    attachMessage(id: string, messageId: string): void {
        this.db.update(generationRuns).set({ messageId }).where(eq(generationRuns.id, id)).run()
    }

    finish(
        id: string,
        update: {
            status: 'complete' | 'cancelled' | 'failed'
            inputTokens?: number
            outputTokens?: number
            errorCode?: string
            errorMessage?: string
            outputText?: string
            processedOutputText?: string
        },
    ): void {
        this.db
            .update(generationRuns)
            .set({ ...update, completedAt: new Date() })
            .where(eq(generationRuns.id, id))
            .run()
    }

    get(id: string) {
        return this.db.select().from(generationRuns).where(eq(generationRuns.id, id)).get()
    }

    listByMessage(messageId: string) {
        return this.db
            .select()
            .from(generationRuns)
            .where(eq(generationRuns.messageId, messageId))
            .orderBy(asc(generationRuns.startedAt))
            .all()
            .map(mapGenerationRun)
    }

    completedOutput(messageId: string, generationId: string): string | null {
        const run = this.db
            .select()
            .from(generationRuns)
            .where(
                and(eq(generationRuns.id, generationId), eq(generationRuns.messageId, messageId)),
            )
            .get()
        if (!run || run.status !== 'complete') return null
        return run.processedOutputText || run.outputText
    }
}

interface RequestLogRow {
    id: string
    conversation_id: string
    conversation_title: string | null
    status: 'running' | 'complete' | 'cancelled' | 'failed'
    provider: string
    model_id: string
    input_tokens: number | null
    output_tokens: number | null
    error_code: string | null
    error_message: string | null
    started_at: number
    completed_at: number | null
    has_details?: number
}

interface RequestLogDetailRow extends RequestLogRow {
    output_text: string
    processed_output_text: string
}

interface UsageRow {
    provider: string
    model_id: string
    status: 'running' | 'complete' | 'cancelled' | 'failed'
    input_tokens: number | null
    output_tokens: number | null
    started_at: number
    completed_at: number | null
}

function mapRequestLog(row: RequestLogRow) {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        conversationTitle: row.conversation_title,
        source: 'chat' as const,
        status: row.status,
        statusCode:
            row.status === 'complete'
                ? 200
                : row.status === 'running'
                  ? 102
                  : row.status === 'cancelled'
                    ? 499
                    : 500,
        provider: row.provider,
        modelId: row.model_id,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        startedAt: new Date(row.started_at).toISOString(),
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        durationMs: row.completed_at ? Math.max(0, row.completed_at - row.started_at) : null,
        hasDetails: Boolean(row.has_details),
    }
}

function aggregateUsage(rows: UsageRow[]) {
    const completed = rows.filter((row) => row.completed_at !== null)
    const duration = completed.reduce(
        (sum, row) => sum + Math.max(0, (row.completed_at ?? row.started_at) - row.started_at),
        0,
    )
    return {
        requests: rows.length,
        failed: rows.filter((row) => row.status === 'failed').length,
        inputTokens: rows.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
        outputTokens: rows.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
        avgDurationMs: completed.length ? Math.round(duration / completed.length) : null,
    }
}

function groupUsage<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>()
    for (const row of rows) {
        const value = key(row)
        groups.set(value, [...(groups.get(value) ?? []), row])
    }
    return groups
}

function localDay(timestamp: number): string {
    const date = new Date(timestamp)
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-')
}

function parseJson(value: string): unknown {
    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

function mapGenerationRun(row: typeof generationRuns.$inferSelect) {
    return {
        id: row.id,
        conversationId: row.conversationId,
        messageId: row.messageId,
        status: row.status,
        provider: row.provider,
        modelId: row.modelId,
        parameters: row.parametersJson,
        outputText: row.outputText,
        processedOutputText: row.processedOutputText,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        startedAt: iso(row.startedAt),
        completedAt: iso(row.completedAt),
    }
}

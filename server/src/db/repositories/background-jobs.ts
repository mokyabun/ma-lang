import type { BackgroundJob, BackgroundJobError } from '@malang/shared'
import { and, asc, eq, inArray, lt, lte, min, sql } from 'drizzle-orm'

import { backgroundJobs } from '../schema'
import { iso, RepositoryBase } from './base'

type BackgroundJobRow = typeof backgroundJobs.$inferSelect

export interface BackgroundJobRecord extends BackgroundJob {
    payload: unknown
    result: unknown
}

export interface NewBackgroundJob {
    kind: string
    payload: unknown
    maxAttempts: number
    runAfter?: Date
    conversationId?: string | null
    messageId?: string | null
}

const ACTIVE_STATUSES = ['queued', 'running'] as const
const FINISHED_STATUSES = ['complete', 'failed', 'cancelled'] as const

export class BackgroundJobRepository extends RepositoryBase {
    enqueue(input: NewBackgroundJob): BackgroundJobRecord {
        const row = this.db
            .insert(backgroundJobs)
            .values({
                id: crypto.randomUUID(),
                kind: input.kind,
                payloadJson: input.payload,
                status: 'queued',
                maxAttempts: input.maxAttempts,
                runAfter: input.runAfter ?? new Date(),
                conversationId: input.conversationId ?? null,
                messageId: input.messageId ?? null,
            })
            .returning()
            .get()
        return mapJob(row)
    }

    get(id: string): BackgroundJobRecord | null {
        const row = this.db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)).get()
        return row ? mapJob(row) : null
    }

    listActive(filter: { conversationId?: string; messageId?: string }): BackgroundJobRecord[] {
        return this.db
            .select()
            .from(backgroundJobs)
            .where(
                and(
                    inArray(backgroundJobs.status, ACTIVE_STATUSES),
                    filter.conversationId
                        ? eq(backgroundJobs.conversationId, filter.conversationId)
                        : undefined,
                    filter.messageId ? eq(backgroundJobs.messageId, filter.messageId) : undefined,
                ),
            )
            .orderBy(asc(backgroundJobs.createdAt))
            .all()
            .map(mapJob)
    }

    /** Marks up to `limit` due jobs of `kinds` as running and counts the attempt. */
    claimDue(kinds: string[], limit: number, now = new Date()): BackgroundJobRecord[] {
        if (!kinds.length || limit < 1) return []
        return this.sqlite.transaction(() => {
            const due = this.db
                .select({ id: backgroundJobs.id })
                .from(backgroundJobs)
                .where(
                    and(
                        eq(backgroundJobs.status, 'queued'),
                        inArray(backgroundJobs.kind, kinds),
                        lte(backgroundJobs.runAfter, now),
                    ),
                )
                .orderBy(asc(backgroundJobs.runAfter), asc(backgroundJobs.createdAt))
                .limit(limit)
                .all()
            if (!due.length) return []
            return this.db
                .update(backgroundJobs)
                .set({
                    status: 'running',
                    lockedAt: now,
                    attempts: sql`${backgroundJobs.attempts} + 1`,
                })
                .where(
                    inArray(
                        backgroundJobs.id,
                        due.map((row) => row.id),
                    ),
                )
                .returning()
                .all()
                .map(mapJob)
        })()
    }

    nextRunAfter(kinds: string[]): Date | null {
        if (!kinds.length) return null
        return (
            this.db
                .select({ next: min(backgroundJobs.runAfter) })
                .from(backgroundJobs)
                .where(
                    and(eq(backgroundJobs.status, 'queued'), inArray(backgroundJobs.kind, kinds)),
                )
                .get()?.next ?? null
        )
    }

    // The status guard keeps a job cancelled mid-run from being overwritten by its handler.
    complete(id: string, result: unknown): BackgroundJobRecord | null {
        return this.settleRunning(id, {
            status: 'complete',
            resultJson: result ?? null,
            errorJson: null,
            lockedAt: null,
            completedAt: new Date(),
        })
    }

    fail(id: string, error: BackgroundJobError): BackgroundJobRecord | null {
        return this.settleRunning(id, {
            status: 'failed',
            errorJson: error,
            lockedAt: null,
            completedAt: new Date(),
        })
    }

    retryLater(id: string, error: BackgroundJobError, runAfter: Date): BackgroundJobRecord | null {
        return this.settleRunning(id, {
            status: 'queued',
            errorJson: error,
            lockedAt: null,
            runAfter,
        })
    }

    /** Requeues a failed job with a fresh attempt budget. */
    retry(id: string): BackgroundJobRecord | null {
        const row = this.db
            .update(backgroundJobs)
            .set({
                status: 'queued',
                attempts: 0,
                runAfter: new Date(),
                errorJson: null,
                completedAt: null,
            })
            .where(and(eq(backgroundJobs.id, id), eq(backgroundJobs.status, 'failed')))
            .returning()
            .get()
        return row ? mapJob(row) : null
    }

    cancel(filter: { id?: string; messageId?: string; conversationId?: string; kind?: string }) {
        const conditions = [
            filter.id ? eq(backgroundJobs.id, filter.id) : undefined,
            filter.kind ? eq(backgroundJobs.kind, filter.kind) : undefined,
            filter.messageId ? eq(backgroundJobs.messageId, filter.messageId) : undefined,
            filter.conversationId
                ? eq(backgroundJobs.conversationId, filter.conversationId)
                : undefined,
        ].filter((condition) => condition !== undefined)
        // A kind alone would cancel every job of that kind.
        if (!filter.id && !filter.messageId && !filter.conversationId) return []
        return this.db
            .update(backgroundJobs)
            .set({
                status: 'cancelled',
                lockedAt: null,
                completedAt: new Date(),
            })
            .where(and(inArray(backgroundJobs.status, ACTIVE_STATUSES), ...conditions))
            .returning()
            .all()
            .map(mapJob)
    }

    /** Requeues jobs a stopped server left running; ones out of attempts fail instead. */
    recoverInterrupted(): void {
        const now = new Date()
        this.sqlite.transaction(() => {
            this.db
                .update(backgroundJobs)
                .set({
                    status: 'failed',
                    errorJson: { message: 'Server stopped during the last attempt' },
                    lockedAt: null,
                    completedAt: now,
                })
                .where(
                    and(
                        eq(backgroundJobs.status, 'running'),
                        sql`${backgroundJobs.attempts} >= ${backgroundJobs.maxAttempts}`,
                    ),
                )
                .run()
            this.db
                .update(backgroundJobs)
                .set({ status: 'queued', lockedAt: null, runAfter: now })
                .where(eq(backgroundJobs.status, 'running'))
                .run()
        })()
    }

    pruneFinished(before: Date): void {
        this.db
            .delete(backgroundJobs)
            .where(
                and(
                    inArray(backgroundJobs.status, FINISHED_STATUSES),
                    lt(backgroundJobs.updatedAt, before),
                ),
            )
            .run()
    }

    private settleRunning(
        id: string,
        values: Partial<typeof backgroundJobs.$inferInsert>,
    ): BackgroundJobRecord | null {
        const row = this.db
            .update(backgroundJobs)
            .set(values)
            .where(and(eq(backgroundJobs.id, id), eq(backgroundJobs.status, 'running')))
            .returning()
            .get()
        return row ? mapJob(row) : null
    }
}

function mapJob(row: BackgroundJobRow): BackgroundJobRecord {
    return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
        runAfter: iso(row.runAfter),
        conversationId: row.conversationId,
        messageId: row.messageId,
        error: row.errorJson ?? null,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        completedAt: iso(row.completedAt),
        payload: row.payloadJson,
        result: row.resultJson ?? null,
    }
}

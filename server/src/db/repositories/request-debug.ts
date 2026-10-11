import type { GenerationParameters, RequestDebugSnapshot } from '@malang/shared'
import { desc } from 'drizzle-orm'

import { iso, RepositoryBase } from '@/db/repository'

import { requestDebugRecords } from '../schema'

export class RequestDebugRepository extends RepositoryBase {
    create(input: {
        generationId: string
        conversationId: string
        provider: string
        modelId: string
        parameters: GenerationParameters
        request: RequestDebugSnapshot
    }) {
        const row = {
            id: crypto.randomUUID(),
            generationId: input.generationId,
            conversationId: input.conversationId,
            provider: input.provider,
            modelId: input.modelId,
            parametersJson: input.parameters,
            requestJson: sanitizeRequest(input.request),
            createdAt: new Date(),
        }
        this.db.insert(requestDebugRecords).values(row).run()
        this.sqlite
            .query(
                `DELETE FROM request_debug_records
                     WHERE id NOT IN (
                         SELECT id FROM request_debug_records ORDER BY created_at DESC LIMIT 100
                     )`,
            )
            .run()
        return mapRequestDebugRecord(row)
    }

    list(limit = 100) {
        return this.db
            .select()
            .from(requestDebugRecords)
            .orderBy(desc(requestDebugRecords.createdAt))
            .limit(Math.max(1, Math.min(limit, 100)))
            .all()
            .map(mapRequestDebugRecord)
    }

    clear(): number {
        const count = this.sqlite
            .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM request_debug_records')
            .get()?.count
        this.db.delete(requestDebugRecords).run()
        return count || 0
    }
}

function sanitizeRequest(request: RequestDebugSnapshot): RequestDebugSnapshot {
    return {
        ...request,
        endpoint: sanitizeEndpoint(request.endpoint),
        headers: Object.fromEntries(
            Object.entries(request.headers).map(([name, value]) => [
                name,
                isSensitiveHeader(name) ? '[redacted]' : maskSecrets(value),
            ]),
        ),
        body: sanitizeBody(request.body, new WeakSet()),
    }
}

function sanitizeEndpoint(endpoint: string): string {
    try {
        const url = new URL(endpoint)
        if (url.username) url.username = '[redacted]'
        if (url.password) url.password = '[redacted]'
        for (const key of url.searchParams.keys()) {
            if (/(?:authorization|credential|secret|api[-_]?key|token|^key$)/i.test(key)) {
                url.searchParams.set(key, '[redacted]')
            }
        }
        return url.toString()
    } catch {
        return maskSecrets(endpoint)
    }
}

function isSensitiveHeader(name: string): boolean {
    return /(?:authorization|cookie|api[-_]?key|token|secret|credential)/i.test(name)
}

function sanitizeBody(value: unknown, seen: WeakSet<object>, key = ''): unknown {
    if (
        /^(?:authorization|cookie|password|credential|secret|api[-_]?key|(?:auth|access|refresh|session)[-_]?token)$/i.test(
            key,
        )
    ) {
        return '[redacted]'
    }
    if (typeof value === 'string') return maskSecrets(value)
    if (!value || typeof value !== 'object') return value
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    if (Array.isArray(value)) return value.map((item) => sanitizeBody(item, seen))
    return Object.fromEntries(
        Object.entries(value).map(([childKey, child]) => [
            childKey,
            sanitizeBody(child, seen, childKey),
        ]),
    )
}

function maskSecrets(value: string): string {
    return value
        .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
        .replace(/sk-(?:ant-)?[A-Za-z0-9_-]{12,}/g, '[redacted-api-key]')
        .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
}

function mapRequestDebugRecord(row: typeof requestDebugRecords.$inferSelect) {
    return {
        id: row.id,
        generationId: row.generationId,
        conversationId: row.conversationId,
        provider: row.provider,
        modelId: row.modelId,
        parameters: row.parametersJson,
        request: row.requestJson,
        createdAt: iso(row.createdAt),
    }
}

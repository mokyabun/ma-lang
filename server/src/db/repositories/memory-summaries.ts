import type { LongTermMemorySummary } from '@malang/shared'
import { and, asc, eq } from 'drizzle-orm'

import { iso, RepositoryBase, requireValue } from '@/db/repository'

import { conversationMemorySummaries } from '../schema'

export type SparseVector = Record<string, number>

export interface MemorySummaryRecord extends LongTermMemorySummary {
    vector: SparseVector
}

export class MemorySummaryRepository extends RepositoryBase {
    listRecords(conversationId: string): MemorySummaryRecord[] {
        return this.db
            .select()
            .from(conversationMemorySummaries)
            .where(eq(conversationMemorySummaries.conversationId, conversationId))
            .orderBy(asc(conversationMemorySummaries.createdAt))
            .all()
            .map((row) => ({
                id: row.id,
                conversationId: row.conversationId,
                text: row.text,
                sourceMessageIds: row.sourceMessageIdsJson,
                vector: row.vectorJson,
                isImportant: row.isImportant,
                createdAt: iso(row.createdAt),
                updatedAt: iso(row.updatedAt),
            }))
    }

    list(conversationId: string): LongTermMemorySummary[] {
        return this.listRecords(conversationId).map(({ vector: _vector, ...summary }) => summary)
    }

    create(input: {
        conversationId: string
        text: string
        sourceMessageIds: string[]
        vector: SparseVector
    }): LongTermMemorySummary {
        const now = new Date()
        const id = crypto.randomUUID()
        this.db
            .insert(conversationMemorySummaries)
            .values({
                id,
                conversationId: input.conversationId,
                text: input.text,
                sourceMessageIdsJson: input.sourceMessageIds,
                vectorJson: input.vector,
                isImportant: false,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(
            this.list(input.conversationId).find((summary) => summary.id === id),
            'Failed to create memory summary',
        )
    }

    update(
        conversationId: string,
        summaryId: string,
        patch: { text?: string; isImportant?: boolean; vector?: SparseVector },
    ): LongTermMemorySummary | null {
        const current = this.db
            .select()
            .from(conversationMemorySummaries)
            .where(
                and(
                    eq(conversationMemorySummaries.id, summaryId),
                    eq(conversationMemorySummaries.conversationId, conversationId),
                ),
            )
            .get()
        if (!current) return null
        this.db
            .update(conversationMemorySummaries)
            .set({
                text: patch.text ?? current.text,
                vectorJson: patch.vector === undefined ? current.vectorJson : patch.vector,
                isImportant: patch.isImportant ?? current.isImportant,
            })
            .where(eq(conversationMemorySummaries.id, summaryId))
            .run()
        return this.list(conversationId).find((summary) => summary.id === summaryId) ?? null
    }

    delete(conversationId: string, summaryId: string): boolean {
        return (
            this.db
                .delete(conversationMemorySummaries)
                .where(
                    and(
                        eq(conversationMemorySummaries.id, summaryId),
                        eq(conversationMemorySummaries.conversationId, conversationId),
                    ),
                )
                .returning({ id: conversationMemorySummaries.id })
                .all().length > 0
        )
    }

    clear(conversationId: string): number {
        return this.db
            .delete(conversationMemorySummaries)
            .where(eq(conversationMemorySummaries.conversationId, conversationId))
            .returning({ id: conversationMemorySummaries.id })
            .all().length
    }
}

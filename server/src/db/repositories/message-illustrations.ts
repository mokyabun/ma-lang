import type {
    MessageIllustration,
    MessageIllustrationStatus,
    NovelAIImageParams,
} from '@malang/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { type IllustrationCaption, illustrationRevisions, messageIllustrations } from '../schema'
import { iso, RepositoryBase } from './base'

type IllustrationRow = typeof messageIllustrations.$inferSelect

export interface MessageIllustrationRecord {
    id: string
    conversationId: string
    messageId: string
    generationRunId: string | null
    slotIndex: number
    status: MessageIllustrationStatus
    plan: unknown
    positive: string
    negative: string
    characters: IllustrationCaption[]
    params: NovelAIImageParams
    activeRevisionId: string | null
}

export type NewMessageIllustration = Omit<MessageIllustrationRecord, 'status' | 'activeRevisionId'>

const UNFINISHED: MessageIllustrationStatus[] = ['pending', 'rendering']

export class MessageIllustrationRepository extends RepositoryBase {
    createMany(rows: NewMessageIllustration[]): void {
        if (!rows.length) return
        this.db
            .insert(messageIllustrations)
            .values(
                rows.map((row) => ({
                    id: row.id,
                    conversationId: row.conversationId,
                    messageId: row.messageId,
                    generationRunId: row.generationRunId,
                    slotIndex: row.slotIndex,
                    status: 'pending' as const,
                    planJson: row.plan,
                    positive: row.positive,
                    negative: row.negative,
                    charCaptionsJson: row.characters,
                    paramsJson: row.params,
                })),
            )
            .run()
    }

    get(id: string): MessageIllustrationRecord | null {
        const row = this.db
            .select()
            .from(messageIllustrations)
            .where(eq(messageIllustrations.id, id))
            .get()
        return row ? mapRecord(row) : null
    }

    view(id: string): MessageIllustration | null {
        return this.views(eq(messageIllustrations.id, id))[0] ?? null
    }

    listViews(conversationId: string): MessageIllustration[] {
        return this.views(eq(messageIllustrations.conversationId, conversationId))
    }

    listForMessage(messageId: string): MessageIllustrationRecord[] {
        return this.db
            .select()
            .from(messageIllustrations)
            .where(eq(messageIllustrations.messageId, messageId))
            .orderBy(asc(messageIllustrations.slotIndex))
            .all()
            .map(mapRecord)
    }

    setStatus(id: string, status: MessageIllustrationStatus, error: string | null = null) {
        this.db
            .update(messageIllustrations)
            .set({ status, error })
            .where(eq(messageIllustrations.id, id))
            .run()
    }

    /** Stores a rendered image and makes it the active revision. */
    addRevision(
        illustrationId: string,
        revision: { assetId: string; seed: number; request: unknown },
    ): void {
        const id = crypto.randomUUID()
        this.sqlite.transaction(() => {
            this.db
                .insert(illustrationRevisions)
                .values({
                    id,
                    illustrationId,
                    assetId: revision.assetId,
                    seed: revision.seed,
                    requestJson: revision.request,
                })
                .run()
            this.db
                .update(messageIllustrations)
                .set({ status: 'complete', error: null, activeRevisionId: id })
                .where(eq(messageIllustrations.id, illustrationId))
                .run()
        })()
    }

    /** Marks a message's unfinished illustrations failed, e.g. after their jobs were cancelled. */
    failUnfinished(messageId: string, error: string): string[] {
        return this.db
            .update(messageIllustrations)
            .set({ status: 'failed', error })
            .where(
                and(
                    eq(messageIllustrations.messageId, messageId),
                    inArray(messageIllustrations.status, UNFINISHED),
                ),
            )
            .returning({ id: messageIllustrations.id })
            .all()
            .map((row) => row.id)
    }

    deleteMany(ids: string[]): void {
        if (!ids.length) return
        this.db.delete(messageIllustrations).where(inArray(messageIllustrations.id, ids)).run()
    }

    private views(condition: ReturnType<typeof eq>): MessageIllustration[] {
        return this.db
            .select({
                row: messageIllustrations,
                assetId: illustrationRevisions.assetId,
            })
            .from(messageIllustrations)
            .leftJoin(
                illustrationRevisions,
                eq(illustrationRevisions.id, messageIllustrations.activeRevisionId),
            )
            .where(condition)
            .orderBy(asc(messageIllustrations.messageId), asc(messageIllustrations.slotIndex))
            .all()
            .map(({ row, assetId }) => ({
                id: row.id,
                conversationId: row.conversationId,
                messageId: row.messageId,
                generationRunId: row.generationRunId,
                slotIndex: row.slotIndex,
                status: row.status,
                assetId: assetId ?? null,
                width: row.paramsJson.width,
                height: row.paramsJson.height,
                error: row.error,
                createdAt: iso(row.createdAt),
                updatedAt: iso(row.updatedAt),
            }))
    }
}

function mapRecord(row: IllustrationRow): MessageIllustrationRecord {
    return {
        id: row.id,
        conversationId: row.conversationId,
        messageId: row.messageId,
        generationRunId: row.generationRunId,
        slotIndex: row.slotIndex,
        status: row.status,
        plan: row.planJson,
        positive: row.positive,
        negative: row.negative,
        characters: row.charCaptionsJson,
        params: row.paramsJson,
        activeRevisionId: row.activeRevisionId,
    }
}

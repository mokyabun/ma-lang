import type { Message } from '@malang/shared'
import { and, asc, desc, eq, max, sql } from 'drizzle-orm'

import { conversations, messages } from '../schema'
import { RepositoryBase, requireValue } from './base'
import { mapMessage } from './conversation-records'

export class MessageRepository extends RepositoryBase {
    list(conversationId: string): Message[] {
        return this.db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(asc(messages.position))
            .all()
            .map(mapMessage)
    }

    get(id: string): Message | null {
        const row = this.db.select().from(messages).where(eq(messages.id, id)).get()
        return row ? mapMessage(row) : null
    }

    create(
        conversationId: string,
        role: Message['role'],
        content: string,
        status: Message['status'],
    ): Message {
        const result = this.db
            .select({ value: max(messages.position) })
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .get()
        const now = new Date()
        const row = {
            id: crypto.randomUUID(),
            conversationId,
            role,
            content,
            position: (result?.value ?? -1) + 1,
            status,
            createdAt: now,
            updatedAt: now,
        }
        this.db.insert(messages).values(row).run()
        this.bumpDisplayEpoch(conversationId)
        return mapMessage(row)
    }

    update(id: string, update: { content?: string; status?: Message['status'] }): Message | null {
        const current = this.db.select().from(messages).where(eq(messages.id, id)).get()
        if (!current) return null
        this.db
            .update(messages)
            .set({
                content: update.content ?? current.content,
                status: update.status ?? current.status,
            })
            .where(eq(messages.id, id))
            .run()
        this.bumpDisplayEpoch(current.conversationId)
        return mapMessage(
            requireValue(
                this.db.select().from(messages).where(eq(messages.id, id)).get(),
                'Failed to update message',
            ),
        )
    }

    truncate(conversationId: string, position: number): number {
        const { count } = this.sqlite
            .query(
                'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ? AND position >= ?',
            )
            .get(conversationId, position) as { count: number }
        this.sqlite
            .query('DELETE FROM messages WHERE conversation_id = ? AND position >= ?')
            .run(conversationId, position)
        if (count) this.bumpDisplayEpoch(conversationId)
        return count
    }

    replace(
        conversationId: string,
        next: Array<{
            id?: string
            role: Message['role']
            content: string
            status?: Message['status']
        }>,
    ): Message[] {
        const now = new Date()
        const existing = new Map(this.list(conversationId).map((message) => [message.id, message]))
        const rows = next.map((message, position) => ({
            id: message.id && existing.has(message.id) ? message.id : crypto.randomUUID(),
            conversationId,
            role: message.role,
            content: message.content ?? '',
            position,
            status: message.status ?? 'complete',
            createdAt:
                message.id && existing.get(message.id)?.createdAt
                    ? new Date(existing.get(message.id)!.createdAt)
                    : now,
            updatedAt: now,
        }))
        this.sqlite.transaction(() => {
            this.sqlite
                .query(
                    'UPDATE messages SET position = position + 1000000 WHERE conversation_id = ?',
                )
                .run(conversationId)
            const keep = new Set(rows.map((row) => row.id))
            for (const current of existing.values()) {
                if (!keep.has(current.id))
                    this.db.delete(messages).where(eq(messages.id, current.id)).run()
            }
            for (const row of rows) {
                if (existing.has(row.id)) {
                    this.db
                        .update(messages)
                        .set({
                            role: row.role,
                            content: row.content,
                            position: row.position,
                            status: row.status,
                        })
                        .where(eq(messages.id, row.id))
                        .run()
                } else {
                    this.db.insert(messages).values(row).run()
                }
            }
            this.bumpDisplayEpoch(conversationId)
        })()
        return this.list(conversationId)
    }

    delete(id: string): void {
        const current = this.db.select().from(messages).where(eq(messages.id, id)).get()
        this.db.delete(messages).where(eq(messages.id, id)).run()
        if (current) this.bumpDisplayEpoch(current.conversationId)
    }

    hasUserMessage(conversationId: string): boolean {
        return !!this.db
            .select({ id: messages.id })
            .from(messages)
            .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'user')))
            .limit(1)
            .get()
    }

    firstAssistant(conversationId: string): Message | null {
        const row = this.db
            .select()
            .from(messages)
            .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'assistant')))
            .orderBy(asc(messages.position))
            .limit(1)
            .get()
        return row ? mapMessage(row) : null
    }

    lastAssistant(conversationId: string): Message | null {
        const row = this.db
            .select()
            .from(messages)
            .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'assistant')))
            .orderBy(desc(messages.position))
            .limit(1)
            .get()
        return row ? mapMessage(row) : null
    }

    bumpDisplayEpoch(conversationId: string): void {
        this.db
            .update(conversations)
            .set({ displayEpoch: sql`${conversations.displayEpoch} + 1` })
            .where(eq(conversations.id, conversationId))
            .run()
    }
}

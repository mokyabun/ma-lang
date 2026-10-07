import type { ConversationGroup } from '@malang/shared'
import { asc, eq } from 'drizzle-orm'

import { conversationGroups } from '../schema'
import { RepositoryBase, requireValue } from './base'
import { mapConversationGroup } from './conversation-records'

export class ConversationGroupRepository extends RepositoryBase {
    list(characterId?: string): ConversationGroup[] {
        const base = this.db.select().from(conversationGroups)
        const rows = characterId
            ? base
                  .where(eq(conversationGroups.characterId, characterId))
                  .orderBy(asc(conversationGroups.sortOrder), asc(conversationGroups.createdAt))
                  .all()
            : base
                  .orderBy(
                      asc(conversationGroups.characterId),
                      asc(conversationGroups.sortOrder),
                      asc(conversationGroups.createdAt),
                  )
                  .all()
        return rows.map(mapConversationGroup)
    }

    create(characterId: string, name: string, sortOrder: number): ConversationGroup {
        const now = new Date()
        const id = crypto.randomUUID()
        this.db
            .insert(conversationGroups)
            .values({
                id,
                characterId,
                name,
                sortOrder,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(
            this.list(characterId).find((group) => group.id === id),
            'Failed to create chat group',
        )
    }

    update(id: string, name: string): ConversationGroup | null {
        const existing = this.db
            .select()
            .from(conversationGroups)
            .where(eq(conversationGroups.id, id))
            .get()
        if (!existing) return null
        this.db.update(conversationGroups).set({ name }).where(eq(conversationGroups.id, id)).run()
        return this.list(existing.characterId).find((group) => group.id === id) ?? null
    }

    delete(id: string): boolean {
        const existing = this.db
            .select({ id: conversationGroups.id })
            .from(conversationGroups)
            .where(eq(conversationGroups.id, id))
            .get()
        if (!existing) return false
        this.db.delete(conversationGroups).where(eq(conversationGroups.id, id)).run()
        return true
    }
}

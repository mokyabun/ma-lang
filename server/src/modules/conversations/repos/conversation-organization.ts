import type { ConversationOrganization } from '@malang/shared'
import { and, eq, isNull, max } from 'drizzle-orm'

import { RepositoryBase } from '@/db/repository'
import { conversationGroups, conversations } from '@/db/schema'

export class ConversationOrganizationRepository extends RepositoryBase {
    update(input: ConversationOrganization): boolean {
        const groupIds = new Set(
            this.db
                .select({ id: conversationGroups.id })
                .from(conversationGroups)
                .where(eq(conversationGroups.characterId, input.characterId))
                .all()
                .map((group) => group.id),
        )
        const conversationIds = new Set(
            this.db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.characterId, input.characterId))
                .all()
                .map((conversation) => conversation.id),
        )
        if (
            input.groups.some((group) => !groupIds.has(group.id)) ||
            input.conversations.some(
                (conversation) =>
                    !conversationIds.has(conversation.id) ||
                    (conversation.groupId !== null && !groupIds.has(conversation.groupId)),
            )
        ) {
            return false
        }

        this.sqlite.transaction(() => {
            for (const group of input.groups) {
                this.db
                    .update(conversationGroups)
                    .set({ sortOrder: group.sortOrder })
                    .where(eq(conversationGroups.id, group.id))
                    .run()
            }
            for (const conversation of input.conversations) {
                this.db
                    .update(conversations)
                    .set({ groupId: conversation.groupId, sortOrder: conversation.sortOrder })
                    .where(eq(conversations.id, conversation.id))
                    .run()
            }
        })()
        return true
    }

    nextRootOrder(characterId: string): number {
        const itemMax = this.db
            .select({ value: max(conversations.sortOrder) })
            .from(conversations)
            .where(and(eq(conversations.characterId, characterId), isNull(conversations.groupId)))
            .get()?.value
        const groupMax = this.db
            .select({ value: max(conversationGroups.sortOrder) })
            .from(conversationGroups)
            .where(eq(conversationGroups.characterId, characterId))
            .get()?.value
        return Math.max(itemMax ?? -1, groupMax ?? -1) + 1
    }
}

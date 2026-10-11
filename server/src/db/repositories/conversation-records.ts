import type { Conversation, ConversationGroup, Message } from '@malang/shared'

import { iso } from '@/db/repository'

import { conversationGroups, conversations, messages } from '../schema'

export function mapConversation(row: typeof conversations.$inferSelect): Conversation {
    return {
        id: row.id,
        characterId: row.characterId,
        promptPresetId: row.promptPresetId,
        promptPresetLocked: row.promptPresetLocked,
        modelPresetId: row.modelPresetId,
        auxiliaryModelPresetId: row.auxiliaryModelPresetId,
        modelChainPresetId: row.modelChainPresetId,
        title: row.title,
        greetingIndex: row.greetingIndex,
        variables: row.variablesJson,
        authorNote: row.authorNote,
        boundPersonaId: row.boundPersonaId,
        personaLocked: row.personaLocked,
        archivedAt: iso(row.archivedAt),
        groupId: row.groupId,
        sortOrder: row.sortOrder,
        displayEpoch: row.displayEpoch,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

export function mapConversationGroup(
    row: typeof conversationGroups.$inferSelect,
): ConversationGroup {
    return {
        id: row.id,
        characterId: row.characterId,
        name: row.name,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

export function mapMessage(row: typeof messages.$inferSelect): Message {
    return {
        id: row.id,
        conversationId: row.conversationId,
        role: row.role,
        content: row.content,
        position: row.position,
        status: row.status,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

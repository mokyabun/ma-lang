import type {
    AppSettings,
    Conversation,
    ConversationCreate,
    ConversationOrganization,
} from '@malang/shared'

import type { Store } from '@/db'
import { NotFoundError } from '@/lib/errors/app-error'
import type { ConversationRepository } from '@/modules/conversations/repos/conversations'
import type { PromptService } from '@/modules/prompts/service'

/** A conversation follows the global default preset unless it pinned its own. */
export function effectivePromptPresetId(conversation: Conversation, settings: AppSettings): string {
    if (conversation.promptPresetLocked) return conversation.promptPresetId
    return settings.defaultPromptPresetId ?? conversation.promptPresetId
}

export class ConversationService {
    constructor(
        private readonly store: Store,
        private readonly prompts: PromptService,
    ) {}

    list(includeArchived = false) {
        return this.store.conversation.list(includeArchived)
    }

    get(id: string) {
        return this.store.conversation.get(id)
    }

    requireConversation(id: string): Conversation {
        const conversation = this.store.conversation.get(id)
        if (!conversation) throw new NotFoundError('Conversation not found')
        return conversation
    }

    update(id: string, update: Parameters<ConversationRepository['update']>[1]) {
        return this.store.conversation.update(id, update)
    }

    archive(id: string) {
        return this.store.conversation.archive(id)
    }

    restore(id: string) {
        return this.store.conversation.restore(id)
    }

    delete(id: string) {
        return this.store.conversation.delete(id)
    }

    isGenerating(id: string): boolean {
        return Boolean(this.store.generation.findRunning(id))
    }

    listGroups(characterId?: string) {
        return this.store.conversationGroup.list(characterId)
    }

    updateGroup(id: string, name: string) {
        return this.store.conversationGroup.update(id, name)
    }

    deleteGroup(id: string) {
        return this.store.conversationGroup.delete(id)
    }

    updateOrganization(input: ConversationOrganization) {
        return this.store.conversationOrganization.update(input)
    }

    /** Throws unless the message exists and belongs to the conversation. */
    requireMessage(conversationId: string, messageId: string) {
        const message = this.store.message.get(messageId)
        if (!message || message.conversationId !== conversationId) {
            throw new NotFoundError('Message not found')
        }
        return message
    }

    updateMessage(id: string, content: string) {
        return this.store.message.update(id, { content })
    }

    /** Deletes every message from `position` onwards and returns how many were removed. */
    truncateMessages(conversationId: string, position: number) {
        return this.store.message.truncate(conversationId, position)
    }

    deleteMessage(id: string) {
        this.store.message.delete(id)
    }

    create(input: ConversationCreate): Conversation {
        return this.store.transaction(() => {
            const character = this.store.character.get(input.characterId)
            if (!character) throw new Error('Character not found')
            const prompt = input.promptPresetId
                ? this.store.promptPreset.get(input.promptPresetId)
                : this.prompts.ensureDefault()
            if (!prompt) throw new Error('Prompt preset not found')
            const conversation = this.store.conversation.create({
                characterId: character.id,
                promptPresetId: prompt.id,
                modelPresetId: input.modelPresetId ?? null,
                auxiliaryModelPresetId: input.auxiliaryModelPresetId ?? null,
                modelChainPresetId: input.modelChainPresetId ?? null,
                title:
                    input.title ||
                    `Chat ${this.store.conversation.countByCharacter(character.id) + 1}`,
                greetingIndex: input.greetingIndex,
                sortOrder: this.store.conversationOrganization.nextRootOrder(character.id),
            })
            const greeting =
                input.greetingIndex >= 0
                    ? character.alternateGreetings[input.greetingIndex]
                    : character.firstMessage
            if (greeting) {
                this.store.message.create(conversation.id, 'assistant', greeting, 'complete')
            }
            return conversation
        })
    }

    createGroup(characterId: string, name: string) {
        return this.store.transaction(() => {
            if (!this.store.character.get(characterId)) return null
            return this.store.conversationGroup.create(
                characterId,
                name,
                this.store.conversationOrganization.nextRootOrder(characterId),
            )
        })
    }

    /** Swaps the opening greeting; only allowed before the user has replied. */
    updateGreeting(id: string, greetingIndex: number, greeting: string): Conversation | null {
        return this.store.transaction(() => {
            if (!this.store.conversation.get(id)) return null
            if (this.store.message.hasUserMessage(id)) return null
            this.store.conversation.setGreetingIndex(id, greetingIndex)
            const first = this.store.message.firstAssistant(id)
            if (first) this.store.message.update(first.id, { content: greeting })
            else if (greeting) this.store.message.create(id, 'assistant', greeting, 'complete')
            return this.store.conversation.get(id)
        })
    }
}

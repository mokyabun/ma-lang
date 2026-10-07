import type { AppSettings, Conversation, ConversationCreate } from '@malang/shared'

import type { Store } from '@/db'

import type { PromptService } from './prompts'

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

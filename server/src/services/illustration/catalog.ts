import type {
    ConversationIllustrationSettings,
    ConversationIllustrationSettingsInput,
    IllustrationActor,
    IllustrationActorInput,
    IllustrationActorOwner,
    IllustrationStateDefinition,
    IllustrationStateDefinitionInput,
    IllustrationStyle,
    IllustrationStyleInput,
} from '@malang/shared'

import type { Store } from '@/db'
import { ConflictError, NotFoundError, ValidationError } from '@/errors/app-error'

/** Styles, actors with their outfits, and per-conversation illustration settings. */
export class IllustrationCatalogService {
    constructor(private readonly store: Store) {}

    listStyles(): IllustrationStyle[] {
        return this.store.illustrationStyle.list()
    }

    createStyle(input: IllustrationStyleInput): IllustrationStyle {
        return this.store.illustrationStyle.create(input)
    }

    updateStyle(id: string, input: IllustrationStyleInput): IllustrationStyle {
        const style = this.store.illustrationStyle.update(id, input)
        if (!style) throw new NotFoundError('Illustration style not found')
        return style
    }

    deleteStyle(id: string): void {
        if (!this.store.illustrationStyle.delete(id)) {
            throw new NotFoundError('Illustration style not found')
        }
    }

    listActors(owner: IllustrationActorOwner): IllustrationActor[] {
        this.requireOwner(owner)
        return this.store.illustrationActor.list(owner)
    }

    createActor(owner: IllustrationActorOwner, input: IllustrationActorInput): IllustrationActor {
        this.requireOwner(owner)
        if ('personaId' in owner && this.store.illustrationActor.list(owner).length) {
            throw new ConflictError('A persona has at most one illustration actor')
        }
        return this.store.illustrationActor.create(owner, input)
    }

    updateActor(id: string, input: IllustrationActorInput): IllustrationActor {
        const actor = this.store.illustrationActor.update(id, input)
        if (!actor) throw new NotFoundError('Illustration actor not found')
        return actor
    }

    deleteActor(id: string): void {
        if (!this.store.illustrationActor.delete(id)) {
            throw new NotFoundError('Illustration actor not found')
        }
    }

    /** Null lists the global definitions. */
    listStateDefinitions(characterId: string | null): IllustrationStateDefinition[] {
        if (characterId) this.requireOwner({ characterId })
        return this.store.illustrationStateDefinition.list(characterId)
    }

    createStateDefinition(
        characterId: string | null,
        input: IllustrationStateDefinitionInput,
    ): IllustrationStateDefinition {
        if (characterId) this.requireOwner({ characterId })
        this.requireUniqueKey(characterId, input.key)
        return this.store.illustrationStateDefinition.create(characterId, input)
    }

    updateStateDefinition(
        id: string,
        input: IllustrationStateDefinitionInput,
    ): IllustrationStateDefinition {
        const current = this.store.illustrationStateDefinition.get(id)
        if (!current) throw new NotFoundError('State definition not found')
        this.requireUniqueKey(current.characterId, input.key, id)
        return this.store.illustrationStateDefinition.update(id, input)!
    }

    deleteStateDefinition(id: string): void {
        if (!this.store.illustrationStateDefinition.delete(id)) {
            throw new NotFoundError('State definition not found')
        }
    }

    private requireUniqueKey(characterId: string | null, key: string, exceptId?: string): void {
        const existing = this.store.illustrationStateDefinition.findKey(characterId, key)
        if (existing && existing.id !== exceptId) {
            throw new ConflictError(`State "${key}" is already defined`)
        }
    }

    /** A conversation that never saved its own settings follows the global defaults. */
    conversationSettings(conversationId: string): ConversationIllustrationSettings {
        this.requireConversation(conversationId)
        const saved = this.store.conversationIllustrationSettings.get(conversationId)
        if (saved) return saved
        const defaults = this.store.illustrationSettings.get()
        return {
            conversationId,
            enabled: false,
            mode: defaults.defaultMode,
            count: defaults.defaultCount,
            styleId: null,
            analysisModelPresetId: null,
            sceneDirection: '',
        }
    }

    saveConversationSettings(
        conversationId: string,
        input: ConversationIllustrationSettingsInput,
    ): ConversationIllustrationSettings {
        this.requireConversation(conversationId)
        if (input.styleId && !this.store.illustrationStyle.get(input.styleId)) {
            throw new ValidationError('Illustration style does not exist')
        }
        if (
            input.analysisModelPresetId &&
            !this.store.modelPreset.get(input.analysisModelPresetId)
        ) {
            throw new ValidationError('Analysis model preset does not exist')
        }
        return this.store.conversationIllustrationSettings.save(conversationId, input)
    }

    private requireOwner(owner: IllustrationActorOwner): void {
        const exists =
            'characterId' in owner
                ? this.store.character.get(owner.characterId)
                : this.store.persona.get(owner.personaId)
        if (!exists) throw new NotFoundError('Actor owner not found')
    }

    private requireConversation(conversationId: string): void {
        if (!this.store.conversation.get(conversationId)) {
            throw new NotFoundError('Conversation not found')
        }
    }
}

import type { Conversation } from '@malang/shared'
import { asc, count, desc, eq, isNull } from 'drizzle-orm'

import { conversations } from '../schema'
import { RepositoryBase, requireValue } from './base'
import { mapConversation } from './conversation-records'

export interface NewConversationRecord {
    characterId: string
    promptPresetId: string
    modelPresetId: string | null
    auxiliaryModelPresetId: string | null
    modelChainPresetId: string | null
    title: string
    greetingIndex: number
    sortOrder: number
}

export class ConversationRepository extends RepositoryBase {
    create(input: NewConversationRecord): Conversation {
        const id = crypto.randomUUID()
        const now = new Date()
        this.db
            .insert(conversations)
            .values({
                id,
                ...input,
                promptPresetLocked: false,
                variablesJson: {},
                authorNote: '',
                boundPersonaId: null,
                personaLocked: false,
                groupId: null,
                archivedAt: null,
                displayEpoch: 0,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(this.get(id), 'Failed to create conversation')
    }

    countByCharacter(characterId: string): number {
        const row = this.db
            .select({ value: count() })
            .from(conversations)
            .where(eq(conversations.characterId, characterId))
            .get()
        return row?.value ?? 0
    }

    list(includeArchived = false): Conversation[] {
        const query = this.db
            .select()
            .from(conversations)
            .orderBy(asc(conversations.sortOrder), desc(conversations.updatedAt))
        const rows = includeArchived
            ? query.all()
            : query.where(isNull(conversations.archivedAt)).all()
        return rows.map(mapConversation)
    }

    get(id: string): Conversation | null {
        const row = this.db.select().from(conversations).where(eq(conversations.id, id)).get()
        return row ? mapConversation(row) : null
    }

    update(
        id: string,
        update: Partial<
            Pick<
                Conversation,
                | 'title'
                | 'promptPresetId'
                | 'promptPresetLocked'
                | 'modelPresetId'
                | 'auxiliaryModelPresetId'
                | 'modelChainPresetId'
                | 'variables'
                | 'authorNote'
                | 'boundPersonaId'
                | 'personaLocked'
            >
        >,
    ): Conversation | null {
        const current = this.get(id)
        if (!current) return null
        this.db
            .update(conversations)
            .set({
                title: update.title ?? current.title,
                promptPresetId: update.promptPresetId ?? current.promptPresetId,
                promptPresetLocked: update.promptPresetLocked ?? current.promptPresetLocked,
                modelPresetId:
                    update.modelPresetId === undefined
                        ? current.modelPresetId
                        : update.modelPresetId,
                auxiliaryModelPresetId:
                    update.auxiliaryModelPresetId === undefined
                        ? current.auxiliaryModelPresetId
                        : update.auxiliaryModelPresetId,
                modelChainPresetId:
                    update.modelChainPresetId === undefined
                        ? current.modelChainPresetId
                        : update.modelChainPresetId,
                variablesJson: update.variables ?? current.variables,
                authorNote: update.authorNote ?? current.authorNote,
                boundPersonaId:
                    update.boundPersonaId === undefined
                        ? current.boundPersonaId
                        : update.boundPersonaId,
                personaLocked: update.personaLocked ?? current.personaLocked,
                displayEpoch:
                    update.variables === undefined &&
                    update.promptPresetId === undefined &&
                    update.promptPresetLocked === undefined &&
                    update.boundPersonaId === undefined &&
                    update.personaLocked === undefined
                        ? current.displayEpoch
                        : current.displayEpoch + 1,
            })
            .where(eq(conversations.id, id))
            .run()
        return this.get(id)
    }

    archive(id: string): boolean {
        if (!this.get(id)) return false
        this.db
            .update(conversations)
            .set({ archivedAt: new Date() })
            .where(eq(conversations.id, id))
            .run()
        return true
    }

    delete(id: string): boolean {
        if (!this.get(id)) return false
        this.db.delete(conversations).where(eq(conversations.id, id)).run()
        return true
    }

    restore(id: string): boolean {
        if (!this.get(id)) return false
        this.db
            .update(conversations)
            .set({ archivedAt: null })
            .where(eq(conversations.id, id))
            .run()
        return true
    }

    setVariables(id: string, variables: Conversation['variables']): void {
        this.db
            .update(conversations)
            .set({ variablesJson: variables, updatedAt: new Date() })
            .where(eq(conversations.id, id))
            .run()
    }

    setGreetingIndex(id: string, greetingIndex: number): void {
        this.db.update(conversations).set({ greetingIndex }).where(eq(conversations.id, id)).run()
    }
}

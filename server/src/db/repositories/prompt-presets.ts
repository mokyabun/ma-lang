import type { PromptPreset, PromptPresetInput } from '@malang/shared'
import { asc, eq } from 'drizzle-orm'

import { appSettings, conversations, promptPresets } from '../schema'
import { RepositoryBase, requireValue } from './base'
import { defaultPromptSettings, mapPromptPreset } from './prompt-records'

export class PromptPresetRepository extends RepositoryBase {
    create(
        input: PromptPresetInput,
        source: Record<string, unknown> = {},
        warnings: string[] = [],
    ): PromptPreset {
        const id = crypto.randomUUID()
        const now = new Date()
        this.db
            .insert(promptPresets)
            .values({
                id,
                name: input.name,
                blocksJson: input.blocks,
                parametersJson: input.parameters,
                defaultVariablesJson: input.defaultVariables,
                togglesJson: input.toggles || [],
                regexScriptsJson: input.regexScripts || [],
                moduleIntegrationsJson: input.moduleIntegrations || [],
                biasJson: input.bias || [],
                promptSettingsJson: { ...defaultPromptSettings, ...input.promptSettings },
                warningsJson: warnings,
                sourceJson: source,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(this.get(id), 'Failed to create prompt preset')
    }

    update(id: string, input: PromptPresetInput): PromptPreset | null {
        if (!this.get(id)) return null
        this.db
            .update(promptPresets)
            .set({
                name: input.name,
                blocksJson: input.blocks,
                parametersJson: input.parameters,
                defaultVariablesJson: input.defaultVariables,
                togglesJson: input.toggles || [],
                regexScriptsJson: input.regexScripts || [],
                moduleIntegrationsJson: input.moduleIntegrations || [],
                biasJson: input.bias || [],
                promptSettingsJson: { ...defaultPromptSettings, ...input.promptSettings },
            })
            .where(eq(promptPresets.id, id))
            .run()
        return this.get(id)
    }

    list(): PromptPreset[] {
        return this.db
            .select()
            .from(promptPresets)
            .orderBy(asc(promptPresets.name))
            .all()
            .map(mapPromptPreset)
    }

    get(id: string): PromptPreset | null {
        const row = this.db.select().from(promptPresets).where(eq(promptPresets.id, id)).get()
        return row ? mapPromptPreset(row) : null
    }

    source(id: string): Record<string, unknown> {
        const row = this.db
            .select({ sourceJson: promptPresets.sourceJson })
            .from(promptPresets)
            .where(eq(promptPresets.id, id))
            .get()
        return row?.sourceJson || {}
    }

    delete(id: string): 'deleted' | 'not_found' | 'in_use' {
        if (!this.get(id)) return 'not_found'
        const isDefault = this.db
            .select({ id: appSettings.id })
            .from(appSettings)
            .where(eq(appSettings.defaultPromptPresetId, id))
            .get()
        if (isDefault) return 'in_use'
        const used = this.db
            .select({ id: conversations.id })
            .from(conversations)
            .where(eq(conversations.promptPresetId, id))
            .limit(1)
            .get()
        if (used) return 'in_use'
        this.db.delete(promptPresets).where(eq(promptPresets.id, id)).run()
        return 'deleted'
    }
}

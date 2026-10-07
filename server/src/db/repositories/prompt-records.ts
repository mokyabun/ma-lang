import type { LoreEntry, PromptModule, PromptPreset } from '@malang/shared'
import { LoreEntrySchema, PromptToggleSchema } from '@malang/shared'

import { promptModules, promptPresets } from '../schema'
import { iso, mapLuaScript } from './base'

export const defaultPromptSettings = {
    assistantPrefill: '',
    postEndInnerFormat: '',
    sendChatAsSystem: false,
    sendName: false,
    trimStartNewChat: false,
    groupTemplate: '',
}

export function mapPromptPreset(row: typeof promptPresets.$inferSelect): PromptPreset {
    return {
        id: row.id,
        name: row.name,
        blocks: row.blocksJson,
        parameters: row.parametersJson,
        defaultVariables: row.defaultVariablesJson,
        toggles: row.togglesJson,
        regexScripts: row.regexScriptsJson,
        moduleIntegrations: row.moduleIntegrationsJson,
        bias: row.biasJson,
        promptSettings: row.promptSettingsJson,
        warnings: row.warningsJson,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

export function mapPromptModule(row: typeof promptModules.$inferSelect): PromptModule {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        namespace: row.namespace,
        sourceId: row.sourceId,
        runtimeOrder: row.runtimeOrder,
        luaScript: mapLuaScript(row),
        luaRawTriggers: row.luaRawTriggerJson,
        enabledByDefault: row.enabledByDefault,
        prompts: row.promptsJson,
        toggles: normalizeModuleToggles(row.togglesJson),
        regexScripts: row.regexScriptsJson,
        backgroundEmbedding: row.backgroundEmbedding,
        lorebook: normalizeLoreEntries(row.lorebookJson),
        assets: [],
        warnings: row.warningsJson,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

function normalizeModuleToggles(value: unknown): PromptModule['toggles'] {
    if (!Array.isArray(value)) return []
    return value.flatMap((toggle) => {
        if (!toggle || typeof toggle !== 'object' || Array.isArray(toggle)) return []
        const candidate = toggle as Record<string, unknown>
        if (typeof candidate.type === 'string') {
            const parsed = PromptToggleSchema.safeParse(candidate)
            return parsed.success ? [parsed.data] : []
        }
        if (typeof candidate.key !== 'string' || typeof candidate.label !== 'string') return []
        const parsed = PromptToggleSchema.safeParse({
            key: candidate.key,
            label: candidate.label,
            type: 'boolean',
            options: [],
            defaultValue: candidate.defaultEnabled === true ? '1' : '0',
        })
        return parsed.success ? [parsed.data] : []
    })
}

function normalizeLoreEntries(value: unknown): LoreEntry[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((entry) => {
        const parsed = LoreEntrySchema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
    })
}

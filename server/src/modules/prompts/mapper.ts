import type { PromptPreset } from '@malang/shared'

import { iso } from '@/db/repository'
import type { promptPresets } from '@/db/schema'

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

import { afterEach, describe, expect, test } from 'bun:test'

import type { AppSettings } from '@malang/shared'
import { createStore } from 'jotai/vanilla'

import { api } from '@/lib/api'
import { settingsAtom, updatePromptToggleValuesAtom } from '@/lib/store'

import { loadSettingsAtom } from './atom'

const originalApi = {
    settings: api.settings,
    updateSettings: api.updateSettings,
    provider: api.provider,
    promptPresets: api.promptPresets,
    promptModules: api.promptModules,
    personas: api.personas,
    modelCatalog: api.modelCatalog,
    modelChains: api.modelChains,
}

afterEach(() => Object.assign(api, originalApi))

describe('settings loading', () => {
    test('does not overwrite a prompt-toggle write with an older in-flight read', async () => {
        const oldSettings = createSettings({})
        const savedSettings = createSettings({ quiet: '1' })
        const providerGate = Promise.withResolvers<void>()

        api.settings = async () => oldSettings
        api.updateSettings = async () => savedSettings
        api.provider = async () => {
            await providerGate.promise
            return null
        }
        api.promptPresets = async () => ({ promptPresets: [] })
        api.promptModules = async () => ({ modules: [] })
        api.personas = async () => ({ personas: [] })
        api.modelCatalog = async () => ({ presets: [], apiKeys: [] })
        api.modelChains = async () => ({ presets: [] })

        const store = createStore()
        store.set(settingsAtom, oldSettings)
        const loading = store.set(loadSettingsAtom)
        await store.set(updatePromptToggleValuesAtom, { quiet: '1' })
        providerGate.resolve()
        await loading

        expect(store.get(settingsAtom)?.promptToggleValues).toEqual({ quiet: '1' })
    })
})

function createSettings(promptToggleValues: Record<string, string>): AppSettings {
    return {
        userName: 'User',
        globalVariables: {},
        promptToggleValues,
        defaultPromptPresetId: null,
        defaultModelPresetId: null,
        defaultAuxiliaryModelPresetId: null,
        selectedPersonaId: null,
        requestDebugEnabled: false,
        autoBackupEnabled: true,
        jailbreakToggle: false,
        chainOfThought: false,
    }
}

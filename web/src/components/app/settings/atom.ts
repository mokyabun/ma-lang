import { atom } from 'jotai'

import { personaListAtom, selectedPersonaIdAtom } from '@/features/personas/atom'
import { api } from '@/lib/api'
import {
    modelApiKeysAtom,
    modelChainPresetsAtom,
    modelPresetsAtom,
    promptToggleRevisionAtom,
    promptModulesAtom,
    promptPresetsAtom,
    providerAtom,
    settingsAtom,
} from '@/lib/store'

export const settingsInitializedAtom = atom(false)

export const settingsLoadingAtom = atom(false)

export const settingsErrorAtom = atom('')

export const loadSettingsAtom = atom(null, async (get, set) => {
    if (get(settingsLoadingAtom)) return

    const promptToggleRevision = get(promptToggleRevisionAtom)
    set(settingsLoadingAtom, true)
    set(settingsErrorAtom, '')
    try {
        const [
            settings,
            provider,
            presetResult,
            moduleResult,
            personaResult,
            modelCatalog,
            chains,
        ] = await Promise.all([
            api.settings(),
            api.provider(),
            api.promptPresets(),
            api.promptModules(),
            api.personas(),
            api.modelCatalog(),
            api.modelChains(),
        ])
        // A toggle save can finish while the settings screen is loading. In that case this
        // response may contain the value read before the save and must not overwrite it.
        if (get(promptToggleRevisionAtom) === promptToggleRevision) {
            set(settingsAtom, settings)
        }
        set(providerAtom, provider)
        set(modelPresetsAtom, modelCatalog.presets)
        set(modelApiKeysAtom, modelCatalog.apiKeys)
        set(modelChainPresetsAtom, chains.presets)
        set(promptPresetsAtom, presetResult.promptPresets)
        set(promptModulesAtom, moduleResult.modules)
        set(personaListAtom, personaResult.personas)
        set(selectedPersonaIdAtom, settings.selectedPersonaId)
    } catch (cause) {
        set(
            settingsErrorAtom,
            cause instanceof Error ? cause.message : '설정을 불러오지 못했습니다.',
        )
    } finally {
        set(settingsInitializedAtom, true)
        set(settingsLoadingAtom, false)
    }
})

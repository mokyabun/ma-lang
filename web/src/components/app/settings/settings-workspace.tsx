import { WarningCircle } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { api } from '@/lib/api'

import {
    promptModulesAtom,
    promptPresetsAtom,
    modelApiKeysAtom,
    modelChainPresetsAtom,
    modelPresetsAtom,
    selectedConversationIdAtom,
    settingsAtom,
} from '../atom'
import { conversationModuleStatesAtom } from '../chat/atom'
import { loadSettingsAtom, settingsErrorAtom, settingsInitializedAtom } from './atom'
import { SettingsPanel } from './settings-panel'
import { type SettingsSection } from './types'

export function SettingsWorkspace({ section }: { section: SettingsSection }) {
    const navigate = useNavigate()
    const [settings, setSettings] = useAtom(settingsAtom)
    const [modelPresets, setModelPresets] = useAtom(modelPresetsAtom)
    const [modelApiKeys, setModelApiKeys] = useAtom(modelApiKeysAtom)
    const [modelChains, setModelChains] = useAtom(modelChainPresetsAtom)
    const [presets, setPresets] = useAtom(promptPresetsAtom)
    const [modules, setModules] = useAtom(promptModulesAtom)
    const initialized = useAtomValue(settingsInitializedAtom)
    const error = useAtomValue(settingsErrorAtom)
    const selectedConversationId = useAtomValue(selectedConversationIdAtom)
    const loadSettings = useSetAtom(loadSettingsAtom)
    const setModuleStates = useSetAtom(conversationModuleStatesAtom)

    useEffect(() => {
        queueMicrotask(() => void loadSettings())
    }, [loadSettings])

    if (!settings && !initialized) {
        return (
            <main className="grid h-dvh place-content-center justify-items-center gap-3 bg-background">
                <p className="text-sm text-muted-foreground">설정을 불러오는 중…</p>
            </main>
        )
    }

    return (
        <div className="relative h-dvh bg-background">
            {error ? (
                <Alert className="absolute bottom-5 right-5 z-50 w-[min(24rem,calc(100%-2rem))] border-destructive/40 bg-destructive/10 text-destructive shadow-xl max-sm:bottom-3 max-sm:right-3">
                    <WarningCircle aria-hidden="true" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}
            <SettingsPanel
                section={section}
                settings={settings}
                modelPresets={modelPresets}
                modelApiKeys={modelApiKeys}
                modelChains={modelChains}
                presets={presets}
                modules={modules}
                onBack={() => void navigate({ to: '/characters' })}
                onSectionChange={(nextSection) =>
                    void navigate({
                        to: '/settings/$section',
                        params: { section: nextSection },
                    })
                }
                onModelCatalogChanged={(nextPresets, nextApiKeys) => {
                    setModelPresets(nextPresets)
                    setModelApiKeys(nextApiKeys)
                }}
                onModelChainsChanged={setModelChains}
                onSettingsChange={setSettings}
                onPromptsChanged={(nextPresets, nextModules) => {
                    setPresets(nextPresets)
                    setModules(nextModules)
                    if (!selectedConversationId) return
                    void api
                        .conversationModules(selectedConversationId)
                        .then((result) => setModuleStates(result.modules))
                }}
            />
        </div>
    )
}

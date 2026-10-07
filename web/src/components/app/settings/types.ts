import type {
    AppSettings,
    ModelApiKey,
    ModelChainPreset,
    ModelPreset,
    PromptModule,
    PromptPreset,
} from '@malang/shared'

export const SETTINGS_SECTIONS = [
    'theme',
    'provider',
    'chains',
    'persona',
    'prompts',
    'modules',
    'illustration',
    'illustration-styles',
    'system',
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export function isSettingsSection(value: string): value is SettingsSection {
    return SETTINGS_SECTIONS.some((section) => section === value)
}

export interface SettingsPanelProps {
    section: SettingsSection
    settings: AppSettings | null
    modelPresets: ModelPreset[]
    modelApiKeys: ModelApiKey[]
    modelChains: ModelChainPreset[]
    presets: PromptPreset[]
    modules: PromptModule[]
    onBack: () => void
    onSectionChange: (section: SettingsSection) => void
    onModelCatalogChanged: (presets: ModelPreset[], apiKeys: ModelApiKey[]) => void
    onModelChainsChanged: (presets: ModelChainPreset[]) => void
    onSettingsChange: (settings: AppSettings) => void
    onPromptsChanged: (presets: PromptPreset[], modules: PromptModule[]) => void
}

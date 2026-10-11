import { IllustrationSection } from '@/features/illustrations/illustration-section'
import { IllustrationStylesSection } from '@/features/illustrations/illustration-styles-section'
import { SystemSection } from '@/features/system/system-section'
import { ThemeSection } from '@/features/theme/theme-section'

import { ModelChainSection } from './model-chains/model-chain-section'
import { ModelPresetSection } from './model-presets/model-preset-section'
import { ModulesSection } from './modules/modules-section'
import { PersonaSection } from './persona/persona-section'
import { PromptPresetSection } from './prompt/prompt-preset-section'
import type { SettingsPanelProps } from './types'

export function SettingsContent({ section, ...props }: SettingsPanelProps) {
    switch (section) {
        case 'system':
            return (
                <SystemSection
                    settings={props.settings}
                    onSettingsChange={props.onSettingsChange}
                />
            )
        case 'theme':
            return <ThemeSection />
        case 'provider':
            return (
                <ModelPresetSection
                    presets={props.modelPresets}
                    apiKeys={props.modelApiKeys}
                    settings={props.settings}
                    onCatalogChanged={props.onModelCatalogChanged}
                    onSettingsChange={props.onSettingsChange}
                />
            )
        case 'chains':
            return (
                <ModelChainSection
                    presets={props.modelChains}
                    modelPresets={props.modelPresets}
                    onChanged={props.onModelChainsChanged}
                />
            )
        case 'persona':
            return <PersonaSection onSettingsChange={props.onSettingsChange} />
        case 'prompts':
            return (
                <PromptPresetSection
                    settings={props.settings}
                    presets={props.presets}
                    onSettingsChange={props.onSettingsChange}
                    onChanged={(presets) => props.onPromptsChanged(presets, props.modules)}
                />
            )
        case 'illustration':
            return <IllustrationSection modelPresets={props.modelPresets} />
        case 'illustration-styles':
            return <IllustrationStylesSection />
        case 'modules':
            return (
                <ModulesSection
                    modules={props.modules}
                    onChanged={(modules) => props.onPromptsChanged(props.presets, modules)}
                />
            )
    }
}

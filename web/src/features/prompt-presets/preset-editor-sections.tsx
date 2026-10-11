import { PresetAdvancedSection } from './advanced-section'
import { PresetOverviewSection } from './overview-section'
import { PresetParametersSection } from './parameters-section'
import { PresetPromptSection } from './prompt-section'
import { PresetRegexSection } from './regex-section'
import { PresetSettingsSection } from './settings-section'
import type { PresetEditorSectionProps } from './types'

const sections = {
    overview: PresetOverviewSection,
    prompt: PresetPromptSection,
    advanced: PresetAdvancedSection,
    regex: PresetRegexSection,
    parameters: PresetParametersSection,
    settings: PresetSettingsSection,
}

export function PresetEditorSections({ section, ...props }: PresetEditorSectionProps) {
    const Section = sections[section]
    return <Section {...props} />
}

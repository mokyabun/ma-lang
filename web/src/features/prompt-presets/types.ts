import type { GenerationParameters, PromptBlock, PromptPresetInput } from '@malang/shared'

export type PresetSection = 'overview' | 'prompt' | 'advanced' | 'parameters' | 'regex' | 'settings'

export type ResolvedPromptSettings = {
    assistantPrefill: string
    postEndInnerFormat: string
    sendChatAsSystem: boolean
    sendName: boolean
    trimStartNewChat: boolean
    groupTemplate: string
}

export type PresetEditorSectionProps = {
    section: PresetSection
    value: PromptPresetInput
    promptSettings: ResolvedPromptSettings
    onChange: (value: PromptPresetInput) => void
    updateBlock: (index: number, block: PromptBlock) => void
    moveBlock: (index: number, direction: -1 | 1) => void
    updateParameter: (
        key: keyof GenerationParameters,
        rawValue: string,
        integer?: boolean,
        immediate?: boolean,
    ) => void
    updateVariables: (entries: Array<[string, string]>) => void
}

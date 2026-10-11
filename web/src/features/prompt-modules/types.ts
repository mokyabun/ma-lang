import type { ModuleAsset, PromptModuleInput } from '@malang/shared'

export type ModuleEditorProps = {
    value: PromptModuleInput
    assets: ModuleAsset[]
    onChange: (value: PromptModuleInput) => void
}

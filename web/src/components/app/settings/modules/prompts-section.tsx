import { TabsContent } from '@/components/ui/tabs'
import { removeAt, replaceAt } from '@/lib/collections'

import { EditorSection } from '../shared/editor-section'
import { blankModulePrompt } from './model'
import { ModulePromptRow } from './module-prompt-row'
import type { ModuleEditorProps } from './types'

export function ModulePromptsSection({
    value,
    onChange,
}: Pick<ModuleEditorProps, 'value' | 'onChange'>) {
    return (
        <TabsContent value="prompts">
            <EditorSection
                title="프롬프트 삽입"
                count={value.prompts.length}
                onAdd={() =>
                    onChange({
                        ...value,
                        prompts: [...value.prompts, blankModulePrompt()],
                    })
                }
            >
                {value.prompts.map((prompt, index) => (
                    <ModulePromptRow
                        key={prompt.id}
                        value={prompt}
                        onChange={(next) =>
                            onChange({
                                ...value,
                                prompts: replaceAt(value.prompts, index, next),
                            })
                        }
                        onDelete={() =>
                            onChange({
                                ...value,
                                prompts: removeAt(value.prompts, index),
                            })
                        }
                    />
                ))}
            </EditorSection>
        </TabsContent>
    )
}

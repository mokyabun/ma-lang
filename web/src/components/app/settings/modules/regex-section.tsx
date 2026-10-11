import type { RegexScript } from '@malang/shared'

import { TabsContent } from '@/components/ui/tabs'
import { removeAt, replaceAt } from '@/lib/collections'
import { blankRegex } from '@/lib/prompt-defaults'

import { EditorSection } from '../shared/editor-section'
import { RegexRow } from '../shared/regex-row'
import type { ModuleEditorProps } from './types'

export function ModuleRegexSection({
    value,
    onChange,
}: Pick<ModuleEditorProps, 'value' | 'onChange'>) {
    return (
        <TabsContent value="regex">
            <EditorSection
                title="모듈 정규식"
                count={(value.regexScripts || []).length}
                onAdd={() =>
                    onChange({
                        ...value,
                        regexScripts: [...(value.regexScripts || []), blankRegex()],
                    })
                }
            >
                {(value.regexScripts || []).map((script, index) => (
                    <RegexRow
                        key={script.id}
                        value={script as RegexScript}
                        onChange={(next) =>
                            onChange({
                                ...value,
                                regexScripts: replaceAt(value.regexScripts || [], index, next),
                            })
                        }
                        onDelete={() =>
                            onChange({
                                ...value,
                                regexScripts: removeAt(value.regexScripts || [], index),
                            })
                        }
                    />
                ))}
            </EditorSection>
        </TabsContent>
    )
}

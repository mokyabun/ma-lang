import type { RegexScript } from '@malang/shared'

import { TabsContent } from '@/components/ui/tabs'
import { removeAt, replaceAt } from '@/lib/collections'
import { blankRegex } from '@/lib/prompt-defaults'

import { EditorSection } from '../shared/editor-section'
import { RegexRow } from '../shared/regex-row'
import type { PresetEditorSectionProps } from './types'

export function PresetRegexSection({
    value,
    onChange,
}: Pick<PresetEditorSectionProps, 'value' | 'onChange'>) {
    return (
        <TabsContent
            value="regex"
            id="preset-panel-regex"
            className="min-w-0"
            aria-labelledby="preset-tab-regex"
        >
            <EditorSection
                title="프리셋 정규식"
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

import { EditorSection } from '@/components/form/editor-section'
import { TabsContent } from '@/components/ui/tabs'
import { LoreEntryEditor } from '@/features/lorebook/lore-entry-editor'
import { blankLoreEntry, normalizeLoreEntry } from '@/features/lorebook/model'
import { removeAt, replaceAt } from '@/lib/collections'

import type { ModuleEditorProps } from './types'

export function ModuleLorebookSection({
    value,
    onChange,
}: Pick<ModuleEditorProps, 'value' | 'onChange'>) {
    return (
        <TabsContent value="lorebook">
            <EditorSection
                title="모듈 로어북"
                count={value.lorebook.length}
                onAdd={() =>
                    onChange({
                        ...value,
                        lorebook: [...value.lorebook, blankLoreEntry(value.lorebook.length)],
                    })
                }
            >
                {value.lorebook.map((lore, index) => (
                    <LoreEntryEditor
                        key={lore.id}
                        variant="row"
                        collapsible
                        value={normalizeLoreEntry(lore)}
                        onChange={(next) =>
                            onChange({
                                ...value,
                                lorebook: replaceAt(value.lorebook, index, next),
                            })
                        }
                        onDelete={() =>
                            onChange({
                                ...value,
                                lorebook: removeAt(value.lorebook, index),
                            })
                        }
                    />
                ))}
            </EditorSection>
        </TabsContent>
    )
}

import { Plus } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { TabsContent } from '@/components/ui/tabs'

import { BlockRow } from './block-row'
import { blankBlock } from './model'
import type { PresetEditorSectionProps } from './types'

export function PresetPromptSection({
    value,
    onChange,
    updateBlock,
    moveBlock: move,
}: Pick<PresetEditorSectionProps, 'value' | 'onChange' | 'updateBlock' | 'moveBlock'>) {
    return (
        <TabsContent
            value="prompt"
            id="preset-panel-prompt"
            className="my-6 min-w-0"
            aria-labelledby="preset-tab-prompt"
        >
            <div className="grid grid-cols-[3.5rem_1fr] py-2 font-mono text-[8px] tracking-widest text-muted-foreground">
                <span>순서</span>
                <span>역할 / 내용</span>
            </div>
            <div className="border-b border-border">
                {value.blocks.map((block, index) => (
                    <BlockRow
                        key={block.id}
                        block={block}
                        index={index}
                        onChange={(next) => updateBlock(index, next)}
                        onMove={(direction) => move(index, direction)}
                        onDelete={() =>
                            onChange({
                                ...value,
                                blocks: value.blocks.filter((_, itemIndex) => itemIndex !== index),
                            })
                        }
                    />
                ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-4">
                {(
                    ['plain', 'description', 'persona', 'lorebook', 'chat', 'authornote'] as const
                ).map((type) => (
                    <Button
                        variant="ghost"
                        key={type}
                        onClick={() =>
                            onChange({
                                ...value,
                                blocks: [...value.blocks, blankBlock(type)],
                            })
                        }
                    >
                        <Plus /> {type}
                    </Button>
                ))}
            </div>
        </TabsContent>
    )
}

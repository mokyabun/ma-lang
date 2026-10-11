import type { GenerationParameters, PromptBlock, PromptPresetInput } from '@malang/shared'
import { useState } from 'react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { PresetEditorSections } from './preset-editor-sections'
import type { PresetSection } from './types'

export function PresetEditor({
    value,
    onChange,
    onImmediateChange,
}: {
    value: PromptPresetInput
    onChange: (value: PromptPresetInput) => void
    onImmediateChange?: (value: PromptPresetInput) => void
}) {
    const [section, setSection] = useState<PresetSection>('overview')
    const sections: Array<{ id: PresetSection; label: string; count?: number }> = [
        { id: 'overview', label: '기본 정보' },
        { id: 'prompt', label: '프롬프트', count: value.blocks.length },
        { id: 'parameters', label: '파라미터' },
        { id: 'regex', label: '정규식', count: (value.regexScripts || []).length },
        { id: 'settings', label: '설정' },
        { id: 'advanced', label: '고급 설정' },
    ]
    const promptSettings = {
        assistantPrefill: value.promptSettings?.assistantPrefill ?? '',
        postEndInnerFormat: value.promptSettings?.postEndInnerFormat ?? '',
        sendChatAsSystem: value.promptSettings?.sendChatAsSystem ?? false,
        sendName: value.promptSettings?.sendName ?? false,
        trimStartNewChat: value.promptSettings?.trimStartNewChat ?? false,
        groupTemplate: value.promptSettings?.groupTemplate ?? '',
    }

    function updateBlock(index: number, block: PromptBlock) {
        const blocks = [...value.blocks]
        blocks[index] = block
        onChange({ ...value, blocks })
    }

    function move(index: number, direction: -1 | 1) {
        const target = index + direction
        if (target < 0 || target >= value.blocks.length) return
        const blocks = [...value.blocks]
        const current = blocks[index]
        const other = blocks[target]
        if (!current || !other) return
        blocks[index] = other
        blocks[target] = current
        onChange({ ...value, blocks })
    }

    function updateParameter(
        key: keyof GenerationParameters,
        rawValue: string,
        integer = false,
        immediate = false,
    ) {
        const numeric = rawValue === '' ? undefined : Number(rawValue)
        const next = {
            ...value,
            parameters: {
                ...value.parameters,
                [key]:
                    numeric === undefined || Number.isFinite(numeric)
                        ? integer && numeric !== undefined
                            ? Math.trunc(numeric)
                            : numeric
                        : undefined,
            },
        }
        if (immediate && onImmediateChange) onImmediateChange(next)
        else onChange(next)
    }

    function updateVariables(entries: Array<[string, string]>) {
        onChange({ ...value, defaultVariables: Object.fromEntries(entries) })
    }

    return (
        <div className="w-full min-w-0 py-9">
            <Tabs
                value={section}
                onValueChange={(next) => setSection(next as PresetSection)}
                className="gap-0"
            >
                <TabsList
                    variant="line"
                    className="sticky top-0 z-10 max-w-full shrink-0 overflow-x-auto border-b border-border bg-background/95 backdrop-blur"
                    aria-label="프리셋 설정 영역"
                >
                    {sections.map((item) => (
                        <TabsTrigger
                            key={item.id}
                            id={`preset-tab-${item.id}`}
                            value={item.id}
                            aria-controls={`preset-panel-${item.id}`}
                        >
                            {item.label}
                            {item.count === undefined ? null : (
                                <span className="font-mono text-[9px] text-muted-foreground">
                                    {item.count}
                                </span>
                            )}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <PresetEditorSections
                    section={section}
                    value={value}
                    promptSettings={promptSettings}
                    onChange={onChange}
                    updateBlock={updateBlock}
                    moveBlock={move}
                    updateParameter={updateParameter}
                    updateVariables={updateVariables}
                />
            </Tabs>
        </div>
    )
}

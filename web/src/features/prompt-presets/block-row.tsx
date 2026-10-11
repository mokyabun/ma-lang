import type { PromptBlock } from '@malang/shared'
import { ArrowDown, ArrowUp, CaretDown, Trash } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export function BlockRow({
    block,
    index,
    onChange,
    onMove,
    onDelete,
}: {
    block: PromptBlock
    index: number
    onChange: (value: PromptBlock) => void
    onMove: (direction: -1 | 1) => void
    onDelete: () => void
}) {
    const supportsRole =
        'role' in block ||
        ['description', 'persona', 'lorebook', 'postEverything', 'authornote'].includes(block.type)
    const role =
        'role' in block ? block.role : 'role2' in block ? block.role2 || 'system' : 'system'
    const supportsContent =
        'text' in block ||
        ['description', 'persona', 'lorebook', 'postEverything', 'authornote'].includes(block.type)
    const content =
        'text' in block ? block.text : 'innerFormat' in block ? block.innerFormat || '' : ''
    return (
        <Collapsible
            className={cn('border-t border-border bg-card/50', !block.enabled && 'opacity-50')}
        >
            <div className="grid min-h-12 grid-cols-[3.5rem_minmax(0,1fr)_6.75rem] items-center">
                <span className="font-mono text-[10px] text-primary">
                    {String(index + 1).padStart(2, '0')}
                </span>
                <CollapsibleTrigger
                    render={
                        <Button
                            variant="ghost"
                            className="min-w-0 justify-start gap-2 px-0 hover:bg-transparent [&_svg]:shrink-0 [&[data-panel-open]_svg]:rotate-180"
                        />
                    }
                >
                    <CaretDown aria-hidden="true" />
                    <strong className="truncate text-xs font-medium">{block.type}</strong>
                    <span className="font-mono text-[9px] text-muted-foreground">{role}</span>
                </CollapsibleTrigger>
                <div className="flex justify-end [&>button]:size-8 [&>button]:p-0">
                    <Button variant="ghost" onClick={() => onMove(-1)} aria-label="위로 이동">
                        <ArrowUp />
                    </Button>
                    <Button variant="ghost" onClick={() => onMove(1)} aria-label="아래로 이동">
                        <ArrowDown />
                    </Button>
                    <Button variant="ghost" onClick={onDelete} aria-label="블록 삭제">
                        <Trash />
                    </Button>
                </div>
            </div>
            <CollapsibleContent className="grid grid-cols-[3.5rem_minmax(0,1fr)] border-t border-border data-closed:hidden">
                <span />
                <div className="min-w-0 py-3 pr-3">
                    <header className="mb-2 flex items-center gap-2 max-sm:grid">
                        <Label className="flex min-h-9 items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                            <Checkbox
                                checked={block.enabled}
                                disabled={'raw' in block}
                                onCheckedChange={(checked) => {
                                    if ('raw' in block) return
                                    onChange({ ...block, enabled: checked })
                                }}
                            />
                            <span>{block.type}</span>
                        </Label>
                        {supportsRole ? (
                            <Select
                                value={role}
                                onValueChange={(next) => {
                                    const nextRole = next as 'system' | 'user' | 'bot'
                                    onChange(
                                        ('role' in block
                                            ? { ...block, role: nextRole }
                                            : { ...block, role2: nextRole }) as PromptBlock,
                                    )
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent align="start">
                                    <SelectItem value="system">system</SelectItem>
                                    <SelectItem value="user">user</SelectItem>
                                    <SelectItem value="bot">assistant</SelectItem>
                                </SelectContent>
                            </Select>
                        ) : null}
                    </header>
                    {supportsContent ? (
                        <Textarea
                            className="max-h-96 overflow-y-auto"
                            rows={Math.min(9, Math.max(2, content.split('\n').length + 1))}
                            value={content}
                            placeholder={'{{slot}} 또는 프롬프트 텍스트'}
                            onChange={(event) =>
                                onChange(
                                    ('text' in block
                                        ? { ...block, text: event.target.value }
                                        : {
                                              ...block,
                                              innerFormat: event.target.value,
                                          }) as PromptBlock,
                                )
                            }
                        />
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            대화 기록을 이 위치에 삽입합니다.
                        </p>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

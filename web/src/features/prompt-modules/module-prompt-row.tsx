import type { ModulePrompt } from '@malang/shared'
import { CaretDown, Trash } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export function ModulePromptRow({
    value,
    onChange,
    onDelete,
}: {
    value: ModulePrompt
    onChange: (value: ModulePrompt) => void
    onDelete: () => void
}) {
    return (
        <Collapsible className="mb-3 rounded-md border border-border bg-card">
            <div className="flex min-h-12 items-center gap-2 px-3">
                <CollapsibleTrigger
                    render={
                        <Button
                            variant="ghost"
                            className="min-w-0 flex-1 justify-start gap-2 px-0 hover:bg-transparent [&[data-panel-open]_svg]:rotate-180"
                        />
                    }
                >
                    <CaretDown />
                    <span className="truncate">{value.name || '이름 없는 프롬프트'}</span>
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">
                        {value.position} · {value.role}
                    </span>
                </CollapsibleTrigger>
                <span
                    className={`size-1.5 shrink-0 rounded-full ${value.enabled ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                    aria-label={value.enabled ? '활성' : '비활성'}
                />
                <Button variant="ghost" size="icon" onClick={onDelete} aria-label="프롬프트 삭제">
                    <Trash />
                </Button>
            </div>
            <CollapsibleContent className="grid gap-3 border-t border-border p-3 data-closed:hidden">
                <div className="grid grid-cols-[auto_minmax(8rem,1fr)_9rem_7rem] items-center gap-2 max-md:grid-cols-1">
                    <Label className="flex min-h-9 items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                        <Checkbox
                            checked={value.enabled}
                            onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
                        />
                        <span>활성</span>
                    </Label>
                    <Input
                        value={value.name}
                        onChange={(event) => onChange({ ...value, name: event.target.value })}
                    />
                    <Select
                        value={value.position}
                        onValueChange={(next) =>
                            onChange({
                                ...value,
                                position: next as ModulePrompt['position'],
                            })
                        }
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                            <SelectItem value="beforeMain">before main</SelectItem>
                            <SelectItem value="afterMain">after main</SelectItem>
                            <SelectItem value="beforeChat">before chat</SelectItem>
                            <SelectItem value="afterChat">after chat</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select
                        value={value.role}
                        onValueChange={(next) =>
                            onChange({
                                ...value,
                                role: next as ModulePrompt['role'],
                            })
                        }
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
                </div>
                <Textarea
                    rows={5}
                    value={value.content}
                    onChange={(event) => onChange({ ...value, content: event.target.value })}
                />
                <Label className="grid max-w-52 gap-2">
                    토글 조건
                    <Input
                        value={value.toggleKey || ''}
                        onChange={(event) =>
                            onChange({ ...value, toggleKey: event.target.value || null })
                        }
                        placeholder="프리셋 토글 키 (비우면 항상 포함)"
                    />
                </Label>
            </CollapsibleContent>
        </Collapsible>
    )
}

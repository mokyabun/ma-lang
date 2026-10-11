import type { RegexScript } from '@malang/shared'
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

export function RegexRow({
    value,
    onChange,
    onDelete,
}: {
    value: RegexScript
    onChange: (value: RegexScript) => void
    onDelete: () => void
}) {
    return (
        <Collapsible className="mb-3 rounded-md border border-border bg-card">
            <div className="flex min-h-12 items-center gap-2 px-3">
                <CollapsibleTrigger
                    render={
                        <Button
                            variant="ghost"
                            className="min-w-0 flex-1 justify-start gap-2 px-0 hover:bg-transparent [&_svg]:shrink-0 [&[data-panel-open]_svg]:rotate-180"
                        />
                    }
                >
                    <CaretDown aria-hidden="true" />
                    <span className="truncate text-left">
                        {value.comment.trim() || '이름 없는 정규식'}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">
                        {value.phase}
                    </span>
                </CollapsibleTrigger>
                <span
                    className={`size-1.5 shrink-0 rounded-full ${value.enabled ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                    aria-label={value.enabled ? '활성' : '비활성'}
                />
                <Button variant="ghost" size="icon" onClick={onDelete} aria-label="정규식 삭제">
                    <Trash />
                </Button>
            </div>
            <CollapsibleContent className="grid gap-3 border-t border-border p-3 data-closed:hidden">
                <div className="grid grid-cols-[auto_minmax(8rem,1.2fr)_minmax(7rem,.7fr)_minmax(8rem,.8fr)] items-center gap-2 max-md:grid-cols-1">
                    <Label className="flex min-h-9 items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                        <Checkbox
                            checked={value.enabled}
                            onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
                        />
                        <span>활성</span>
                    </Label>
                    <Input
                        value={value.comment}
                        onChange={(event) => onChange({ ...value, comment: event.target.value })}
                        placeholder="스크립트 이름"
                    />
                    <Select
                        value={value.phase}
                        onValueChange={(next) =>
                            onChange({
                                ...value,
                                phase: next as RegexScript['phase'],
                            })
                        }
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                            <SelectItem value="editinput">editinput</SelectItem>
                            <SelectItem value="editprocess">editprocess</SelectItem>
                            <SelectItem value="editoutput">editoutput</SelectItem>
                            <SelectItem value="editdisplay">editdisplay</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        value={value.flags}
                        onChange={(event) => onChange({ ...value, flags: event.target.value })}
                        placeholder="gms&lt;order 1&gt;"
                    />
                </div>
                <Textarea
                    className="max-h-56 overflow-y-auto font-mono text-xs"
                    rows={3}
                    value={value.pattern}
                    onChange={(event) => onChange({ ...value, pattern: event.target.value })}
                    placeholder="정규식 패턴"
                />
                <Textarea
                    className="max-h-56 overflow-y-auto font-mono text-xs"
                    rows={3}
                    value={value.replacement}
                    onChange={(event) => onChange({ ...value, replacement: event.target.value })}
                    placeholder="치환 텍스트"
                />
            </CollapsibleContent>
        </Collapsible>
    )
}

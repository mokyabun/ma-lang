import type { LoreEntry } from '@malang/shared'
import { CaretDown, Trash } from '@phosphor-icons/react'

import { SettingsGroup } from '@/components/form/settings-group'
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
import { cn } from '@/lib/utils'

import { joinList, LORE_POSITION_OPTIONS, positionSelectValue, splitList } from './model'

export interface LoreEntryEditorProps {
    value: LoreEntry
    variant?: 'row' | 'panel' | 'compact'
    collapsible?: boolean
    onChange: (next: LoreEntry) => void
    onDelete?: () => void
}

export function LoreEntryEditor({
    value,
    variant = 'row',
    collapsible = false,
    onChange,
    onDelete,
}: LoreEntryEditorProps) {
    function field<K extends keyof LoreEntry>(key: K, next: LoreEntry[K]) {
        onChange({ ...value, [key]: next })
    }

    const positionSelect = positionSelectValue(value)
    const isCustomPosition = positionSelect === '__custom__'
    const showsDepth = value.position === 'depth' || value.position === 'reverse_depth'
    const decoratorKeys = Object.keys(value.decorators)

    if (collapsible && variant === 'row') {
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
                        <span className="truncate">{value.name || '이름 없는 로어 항목'}</span>
                        <span className="ml-auto max-w-56 truncate font-mono text-[9px] text-muted-foreground">
                            {value.keys.join(', ') || '상시/키 없음'}
                        </span>
                    </CollapsibleTrigger>
                    <span
                        className={`size-1.5 shrink-0 rounded-full ${value.enabled ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                        aria-label={value.enabled ? '활성' : '비활성'}
                    />
                    {onDelete ? (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onDelete}
                            aria-label="로어 항목 삭제"
                        >
                            <Trash />
                        </Button>
                    ) : null}
                </div>
                <CollapsibleContent className="border-t border-border p-3 data-closed:hidden">
                    <LoreEntryEditor value={value} variant="panel" onChange={onChange} />
                </CollapsibleContent>
            </Collapsible>
        )
    }

    return (
        <article
            className={cn(
                'mb-3 grid gap-3 rounded-md border border-border bg-card p-3 [&>textarea]:mb-1',
                (variant === 'panel' || variant === 'compact') &&
                    'mb-0 border-0 bg-transparent p-0',
            )}
        >
            <div
                className={cn(
                    'grid grid-cols-[auto_auto_minmax(8rem,1fr)_minmax(8rem,1.2fr)_2rem] items-center gap-2 max-md:grid-cols-1',
                    variant === 'compact' && 'grid-cols-1',
                )}
            >
                {variant === 'compact' ? (
                    <Label className="flex min-h-9 items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                        <Checkbox
                            checked={value.enabled}
                            onCheckedChange={(checked) => field('enabled', checked)}
                        />
                        <span>항목 활성</span>
                    </Label>
                ) : (
                    <Checkbox
                        checked={value.enabled}
                        onCheckedChange={(checked) => field('enabled', checked)}
                        aria-label="활성"
                    />
                )}
                <Label className="flex min-h-9 items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                    <Checkbox
                        checked={value.constant}
                        onCheckedChange={(checked) => field('constant', checked)}
                    />
                    <span>항상 삽입</span>
                </Label>
                <Input
                    value={value.name}
                    onChange={(event) => field('name', event.target.value)}
                    placeholder="로어 이름"
                />
                <Input
                    value={joinList(value.keys)}
                    onChange={(event) => field('keys', splitList(event.target.value))}
                    placeholder="keys, comma separated"
                />
                {onDelete ? (
                    <Button variant="ghost" onClick={onDelete} aria-label="로어 항목 삭제">
                        <Trash aria-hidden="true" />
                    </Button>
                ) : null}
            </div>
            <Textarea
                className={variant === 'compact' ? 'field-sizing-fixed resize-y' : undefined}
                rows={variant === 'panel' ? 16 : variant === 'compact' ? 8 : 6}
                value={value.content}
                onChange={(event) => field('content', event.target.value)}
                placeholder="모델 프롬프트에 삽입될 내용"
            />

            <SettingsGroup
                title="활성화"
                contentClassName={cn(
                    'lore-entry-grid',
                    variant === 'compact' && 'grid grid-cols-1 gap-3',
                )}
            >
                <Label className="flex min-h-9 items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                    <Checkbox
                        checked={value.selective}
                        onCheckedChange={(checked) => field('selective', checked)}
                    />
                    <span>선택 탐색 (보조 키 필요)</span>
                </Label>
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    보조 키 · 쉼표 구분
                    <Input
                        value={joinList(value.secondaryKeys)}
                        disabled={!value.selective}
                        onChange={(event) => field('secondaryKeys', splitList(event.target.value))}
                    />
                </Label>
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    활성화 확률 (%)
                    <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={value.probability}
                        onChange={(event) =>
                            field(
                                'probability',
                                Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                            )
                        }
                    />
                </Label>
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    재귀 탐색
                    <Select
                        value={value.recursive}
                        onValueChange={(next) => field('recursive', next as LoreEntry['recursive'])}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                            <SelectItem value="global">전역 설정 따름</SelectItem>
                            <SelectItem value="enabled">항상 재귀 탐색</SelectItem>
                            <SelectItem value="disabled">재귀 탐색 안 함</SelectItem>
                        </SelectContent>
                    </Select>
                </Label>
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    탐색 깊이 (이 항목만)
                    <Input
                        type="number"
                        min={1}
                        max={1_000}
                        value={value.scanDepth ?? ''}
                        placeholder="상속 (캐릭터/전역 설정)"
                        onChange={(event) =>
                            field('scanDepth', Number(event.target.value) || undefined)
                        }
                    />
                </Label>
            </SettingsGroup>

            <SettingsGroup
                title="삽입 위치"
                contentClassName={cn(
                    'lore-entry-grid',
                    variant === 'compact' && 'grid grid-cols-1 gap-3',
                )}
            >
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    위치
                    <Select
                        value={positionSelect}
                        onValueChange={(next) => {
                            if (next === null) return
                            field('position', next === '__custom__' ? 'pt_' : next)
                        }}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                            {LORE_POSITION_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                            <SelectItem value="__custom__">
                                커스텀 프롬프트 위치 (pt_...)
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </Label>
                {isCustomPosition ? (
                    <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                        커스텀 위치 이름
                        <Input
                            value={value.position}
                            onChange={(event) => field('position', event.target.value)}
                            placeholder="pt_intro"
                        />
                    </Label>
                ) : null}
                {showsDepth ? (
                    <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                        깊이
                        <Input
                            type="number"
                            min={0}
                            value={value.depth}
                            onChange={(event) => field('depth', Number(event.target.value) || 0)}
                        />
                    </Label>
                ) : null}
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    역할
                    <Select
                        value={value.role}
                        onValueChange={(next) => field('role', next as LoreEntry['role'])}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                            <SelectItem value="system">system</SelectItem>
                            <SelectItem value="user">user</SelectItem>
                            <SelectItem value="assistant">assistant</SelectItem>
                        </SelectContent>
                    </Select>
                </Label>
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    삽입 순서
                    <Input
                        type="number"
                        value={value.insertionOrder}
                        onChange={(event) =>
                            field('insertionOrder', Number(event.target.value) || 0)
                        }
                    />
                </Label>
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    우선순위 (토큰 예산 초과 시 기준)
                    <Input
                        type="number"
                        value={value.priority}
                        onChange={(event) => field('priority', Number(event.target.value) || 0)}
                    />
                </Label>
            </SettingsGroup>

            <SettingsGroup
                title="고급"
                contentClassName={cn(
                    'lore-entry-advanced',
                    variant === 'compact' && 'grid grid-cols-1 gap-3',
                )}
            >
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    추가 키 · 쉼표 구분
                    <Input
                        value={joinList(value.additionalKeys)}
                        onChange={(event) => field('additionalKeys', splitList(event.target.value))}
                    />
                </Label>
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    제외 키 · 쉼표 구분
                    <Input
                        value={joinList(value.excludeKeys)}
                        onChange={(event) => field('excludeKeys', splitList(event.target.value))}
                    />
                </Label>
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    단어 일치 방식
                    <Select
                        value={
                            value.fullWordMatching === undefined
                                ? 'inherit'
                                : value.fullWordMatching
                                  ? 'full'
                                  : 'partial'
                        }
                        onValueChange={(next) => {
                            field(
                                'fullWordMatching',
                                next === 'inherit' ? undefined : next === 'full',
                            )
                        }}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                            <SelectItem value="inherit">상속 (기본)</SelectItem>
                            <SelectItem value="full">전체 단어 일치</SelectItem>
                            <SelectItem value="partial">부분 일치</SelectItem>
                        </SelectContent>
                    </Select>
                </Label>
                <Label className="flex min-h-9 items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                    <Checkbox
                        checked={value.useRegex}
                        onCheckedChange={(checked) => field('useRegex', checked)}
                    />
                    <span>정규식 키 (RE2 문법)</span>
                </Label>
                <Label className="flex min-h-9 items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                    <Checkbox
                        checked={value.caseSensitive}
                        onCheckedChange={(checked) => field('caseSensitive', checked)}
                    />
                    <span>대소문자 구분</span>
                </Label>
                <Label className="flex min-h-9 items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                    <Checkbox
                        checked={value.isGroup}
                        onCheckedChange={(checked) => field('isGroup', checked === true)}
                    />
                    <span>그룹 폴더로 표시 (활성화 로직에 영향 없음)</span>
                </Label>
                <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                    그룹
                    <Input
                        value={value.group ?? ''}
                        onChange={(event) => field('group', event.target.value || undefined)}
                        placeholder="같은 값을 가진 항목끼리 묶어서 표시합니다"
                    />
                </Label>
                {decoratorKeys.length ? (
                    <div className="col-span-full flex flex-wrap items-center gap-1.5 [&>span:not(.field-note)]:rounded-full [&>span:not(.field-note)]:bg-secondary [&>span:not(.field-note)]:px-2 [&>span:not(.field-note)]:py-0.5 [&>span:not(.field-note)]:text-[9px]">
                        <span className="text-[10px] leading-5 text-muted-foreground">
                            가져온 카드의 데코레이터 (읽기 전용) — 편집하려면 삽입 내용의 {'@@'}{' '}
                            문법을 사용하세요.
                        </span>
                        {decoratorKeys.map((key) => (
                            <span key={key}>{key}</span>
                        ))}
                    </div>
                ) : null}
            </SettingsGroup>
        </article>
    )
}

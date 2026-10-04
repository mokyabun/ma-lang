import type {
    Character,
    CharacterAsset,
    CharacterUpdate,
    LoreEntry,
    RegexScript,
} from '@malang/shared'
import { FileArchive, Plus, Trash, UploadSimple } from '@phosphor-icons/react'
import type { ChangeEvent, ReactNode, RefObject } from 'react'

import { SettingsGroup } from '@/components/app/settings/shared/settings-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useScrollParentVirtualizer } from '@/lib/use-scroll-parent-virtualizer'

import { LoreEntryEditor } from '../lorebook/lore-entry-editor'
import { LorebookTree } from '../lorebook/lorebook-tree'
import { blankLoreEntry } from '../lorebook/model'
import type { CharacterEditorSection } from '../workspace/types'
import { CharacterAvatar } from './character-avatar'
import { blankCharacterRegex, formatBytes } from './model'

export function CharacterEditorSections({
    section,
    character,
    assets,
    draft,
    field,
    avatarSaving,
    avatarInput,
    handleAvatar,
    handleRemoveAvatar,
    lorebook,
    selectedLoreId,
    setSelectedLoreId,
    selectedLore,
    updateLore,
    regexScripts,
    updateRegex,
}: {
    section: CharacterEditorSection
    character: Character
    assets: CharacterAsset[]
    draft: CharacterUpdate
    field: <K extends keyof CharacterUpdate>(key: K, value: CharacterUpdate[K]) => void
    avatarSaving: boolean
    avatarInput: RefObject<HTMLInputElement | null>
    handleAvatar: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
    handleRemoveAvatar: () => Promise<void>
    lorebook: LoreEntry[]
    selectedLoreId: string | null
    setSelectedLoreId: (id: string | null) => void
    selectedLore: LoreEntry | null
    updateLore: (entry: LoreEntry) => void
    regexScripts: RegexScript[]
    updateRegex: (index: number, script: RegexScript) => void
}) {
    return (
        <>
            {section === 'profile' ? (
                <div className="grid min-w-0 gap-4">
                    <EditorField label="캐릭터 이름">
                        <Input
                            value={draft.name || ''}
                            required
                            onChange={(event) => field('name', event.target.value)}
                        />
                    </EditorField>
                    <EditorField label="설명">
                        <Textarea
                            rows={8}
                            value={draft.description || ''}
                            onChange={(event) => field('description', event.target.value)}
                        />
                    </EditorField>
                    <EditorField label="성격">
                        <Textarea
                            rows={6}
                            value={draft.personality || ''}
                            onChange={(event) => field('personality', event.target.value)}
                        />
                    </EditorField>
                    <EditorField label="시나리오">
                        <Textarea
                            rows={6}
                            value={draft.scenario || ''}
                            onChange={(event) => field('scenario', event.target.value)}
                        />
                    </EditorField>
                    <EditorField label="제작자">
                        <Input
                            value={draft.creator || ''}
                            onChange={(event) => field('creator', event.target.value)}
                        />
                    </EditorField>
                    <EditorField label="캐릭터 버전">
                        <Input
                            value={draft.characterVersion || ''}
                            onChange={(event) => field('characterVersion', event.target.value)}
                        />
                    </EditorField>
                    <EditorField label="태그" note="쉼표로 구분">
                        <Input
                            value={(draft.tags ?? []).join(', ')}
                            onChange={(event) =>
                                field('tags', splitValues(event.target.value, ','))
                            }
                        />
                    </EditorField>
                </div>
            ) : null}

            {section === 'display' ? (
                <div className="grid min-w-0 gap-4">
                    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border border-border bg-background p-3 [&_.avatar]:aspect-square [&_.avatar]:size-full">
                        <CharacterAvatar character={character} />
                        <div className="flex min-w-0 flex-col justify-between gap-3">
                            <div>
                                <strong className="block truncate text-xs">대표 이미지</strong>
                                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                                    캐릭터 레일과 대화 화면에 표시됩니다.
                                </p>
                            </div>
                            <div className="grid gap-1.5">
                                <input
                                    ref={avatarInput}
                                    className="sr-only"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    onChange={handleAvatar}
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="justify-start"
                                    disabled={avatarSaving}
                                    onClick={() => avatarInput.current?.click()}
                                >
                                    <UploadSimple aria-hidden="true" /> 이미지 불러오기
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="justify-start text-destructive hover:text-destructive"
                                    disabled={!character.avatarAssetId || avatarSaving}
                                    onClick={() => void handleRemoveAvatar()}
                                >
                                    <Trash aria-hidden="true" /> 이미지 삭제
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {section === 'greetings' ? (
                <div className="grid min-w-0 gap-4">
                    <EditorField label="첫 메시지">
                        <Textarea
                            rows={10}
                            value={draft.firstMessage || ''}
                            onChange={(event) => field('firstMessage', event.target.value)}
                        />
                    </EditorField>
                    <SettingsGroup
                        title="대체 첫 메시지"
                        meta={draft.alternateGreetings?.length ?? 0}
                        defaultOpen
                        contentClassName="grid gap-3"
                    >
                        {(draft.alternateGreetings ?? []).map((greeting, index) => (
                            <div key={`greeting-${index}`} className="grid min-w-0 gap-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">
                                        대체 메시지 {index + 1}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        className="text-destructive"
                                        aria-label={`대체 메시지 ${index + 1} 삭제`}
                                        onClick={() =>
                                            field(
                                                'alternateGreetings',
                                                (draft.alternateGreetings ?? []).filter(
                                                    (_, itemIndex) => itemIndex !== index,
                                                ),
                                            )
                                        }
                                    >
                                        <Trash aria-hidden="true" />
                                    </Button>
                                </div>
                                <Textarea
                                    rows={7}
                                    value={greeting}
                                    onChange={(event) => {
                                        const next = [...(draft.alternateGreetings ?? [])]
                                        next[index] = event.target.value
                                        field('alternateGreetings', next)
                                    }}
                                />
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="secondary"
                            className="justify-start"
                            onClick={() =>
                                field('alternateGreetings', [
                                    ...(draft.alternateGreetings ?? []),
                                    '',
                                ])
                            }
                        >
                            <Plus aria-hidden="true" /> 대체 메시지 추가
                        </Button>
                    </SettingsGroup>
                </div>
            ) : null}

            {section === 'lorebook' ? (
                <div className="grid min-w-0 gap-4">
                    <SettingsGroup title="탐색 설정" defaultOpen contentClassName="grid gap-3">
                        <EditorField label="기본 탐색 깊이">
                            <Input
                                type="number"
                                min={1}
                                max={1000}
                                value={draft.loreSettings?.scanDepth ?? ''}
                                placeholder="전역 설정 사용"
                                onChange={(event) =>
                                    field('loreSettings', {
                                        ...draft.loreSettings,
                                        scanDepth: optionalNumber(event.target.value),
                                    })
                                }
                            />
                        </EditorField>
                        <EditorField label="토큰 예산">
                            <Input
                                type="number"
                                min={1}
                                max={1_000_000}
                                value={draft.loreSettings?.tokenBudget ?? ''}
                                placeholder="전역 설정 사용"
                                onChange={(event) =>
                                    field('loreSettings', {
                                        ...draft.loreSettings,
                                        tokenBudget: optionalNumber(event.target.value),
                                    })
                                }
                            />
                        </EditorField>
                        <Label className="flex items-center justify-between gap-3 bg-background px-2.5 py-2 text-xs text-foreground">
                            재귀 탐색
                            <Switch
                                size="sm"
                                checked={draft.loreSettings?.recursiveScanning ?? false}
                                onCheckedChange={(checked) =>
                                    field('loreSettings', {
                                        ...draft.loreSettings,
                                        recursiveScanning: checked,
                                    })
                                }
                            />
                        </Label>
                    </SettingsGroup>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        aria-label="로어 항목 추가"
                        onClick={() => {
                            const next = blankLoreEntry(lorebook.length)
                            field('lorebook', [...lorebook, next])
                            setSelectedLoreId(next.id)
                        }}
                    >
                        <Plus aria-hidden="true" /> 로어 항목 추가
                    </Button>
                    <LorebookTree
                        entries={lorebook}
                        selectedId={selectedLoreId}
                        onSelect={setSelectedLoreId}
                        onChange={(next) => field('lorebook', next)}
                        onDelete={(id) => {
                            const target = lorebook.find((entry) => entry.id === id)
                            const next = target?.isGroup
                                ? lorebook.filter(
                                      (entry) => entry.id !== id && entry.group !== target.group,
                                  )
                                : lorebook.filter((entry) => entry.id !== id)
                            field('lorebook', next)
                            if (id === selectedLoreId) setSelectedLoreId(next[0]?.id ?? null)
                        }}
                        compact
                    />
                    {selectedLore ? (
                        <LoreEntryEditor
                            value={selectedLore}
                            variant="compact"
                            onChange={updateLore}
                        />
                    ) : (
                        <div className="border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
                            + 버튼으로 첫 로어 항목을 추가하세요.
                        </div>
                    )}
                </div>
            ) : null}

            {section === 'prompt' ? (
                <div className="grid min-w-0 gap-4">
                    <EditorField label="예시 대화">
                        <Textarea
                            rows={10}
                            value={draft.exampleMessage || ''}
                            onChange={(event) => field('exampleMessage', event.target.value)}
                        />
                    </EditorField>
                    <EditorField label="시스템 프롬프트">
                        <Textarea
                            rows={10}
                            value={draft.systemPrompt || ''}
                            onChange={(event) => field('systemPrompt', event.target.value)}
                        />
                    </EditorField>
                    <EditorField label="대화 기록 이후 지침">
                        <Textarea
                            rows={10}
                            value={draft.postHistoryInstructions || ''}
                            onChange={(event) =>
                                field('postHistoryInstructions', event.target.value)
                            }
                        />
                    </EditorField>
                </div>
            ) : null}

            {section === 'advanced' ? (
                <div className="grid min-w-0 gap-4">
                    <SettingsGroup
                        title="Trigger Script"
                        meta={draft.luaScript?.enabled ? 'ON' : 'OFF'}
                        contentClassName="grid gap-3"
                    >
                        <Label className="flex items-center justify-between gap-3 bg-background px-2.5 py-2 text-xs text-foreground">
                            서버에서 실행
                            <Switch
                                size="sm"
                                checked={draft.luaScript?.enabled ?? false}
                                onCheckedChange={(enabled) =>
                                    field('luaScript', {
                                        code: draft.luaScript?.code ?? '',
                                        enabled,
                                        lowLevelAccess: draft.luaScript?.lowLevelAccess ?? false,
                                    })
                                }
                            />
                        </Label>
                        <Label className="flex items-center justify-between gap-3 bg-background px-2.5 py-2 text-xs text-foreground">
                            Low-Level API 허용
                            <Switch
                                size="sm"
                                checked={draft.luaScript?.lowLevelAccess ?? false}
                                onCheckedChange={(lowLevelAccess) =>
                                    field('luaScript', {
                                        code: draft.luaScript?.code ?? '',
                                        enabled: draft.luaScript?.enabled ?? false,
                                        lowLevelAccess,
                                    })
                                }
                            />
                        </Label>
                        <EditorField label="Lua 코드" note="Wasmoon 1.16 · 서버 전용 실행">
                            <Textarea
                                rows={18}
                                className="font-mono text-xs"
                                value={draft.luaScript?.code ?? ''}
                                spellCheck={false}
                                onChange={(event) =>
                                    field('luaScript', {
                                        code: event.target.value,
                                        enabled: draft.luaScript?.enabled ?? true,
                                        lowLevelAccess: draft.luaScript?.lowLevelAccess ?? false,
                                    })
                                }
                            />
                        </EditorField>
                    </SettingsGroup>
                    <EditorField label="기본 변수" note="key=value 형식, 한 줄에 하나">
                        <Textarea
                            rows={6}
                            value={Object.entries(draft.defaultVariables ?? {})
                                .map(([key, value]) => `${key}=${value}`)
                                .join('\n')}
                            onChange={(event) =>
                                field(
                                    'defaultVariables',
                                    Object.fromEntries(
                                        event.target.value
                                            .split(/\r?\n/)
                                            .map((line) => {
                                                const index = line.indexOf('=')
                                                return index > 0
                                                    ? [
                                                          line.slice(0, index).trim(),
                                                          line.slice(index + 1),
                                                      ]
                                                    : null
                                            })
                                            .filter((entry): entry is [string, string] => !!entry),
                                    ),
                                )
                            }
                        />
                    </EditorField>
                    <EditorField label="모듈 참조" note="한 줄에 하나씩 입력">
                        <Textarea
                            rows={5}
                            value={(draft.moduleReferences ?? []).join('\n')}
                            onChange={(event) =>
                                field('moduleReferences', splitValues(event.target.value, '\n'))
                            }
                        />
                    </EditorField>
                    <div className="flex items-center justify-between border-b border-sidebar-border pb-2">
                        <div>
                            <strong className="block text-xs">정규식 스크립트</strong>
                            <span className="text-[9px] text-muted-foreground">
                                {regexScripts.length}개
                            </span>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                                field('regexScripts', [...regexScripts, blankCharacterRegex()])
                            }
                        >
                            <Plus aria-hidden="true" /> 추가
                        </Button>
                    </div>
                    {regexScripts.map((script, index) => (
                        <SettingsGroup
                            key={script.id}
                            title={script.comment || `정규식 ${index + 1}`}
                            meta={script.enabled ? 'ON' : 'OFF'}
                            contentClassName="grid gap-3"
                        >
                            <Label className="flex items-center justify-between gap-3 bg-background px-2.5 py-2 text-xs text-foreground">
                                사용
                                <Switch
                                    size="sm"
                                    checked={script.enabled}
                                    onCheckedChange={(checked) =>
                                        updateRegex(index, { ...script, enabled: checked })
                                    }
                                />
                            </Label>
                            <EditorField label="이름">
                                <Input
                                    value={script.comment}
                                    onChange={(event) =>
                                        updateRegex(index, {
                                            ...script,
                                            comment: event.target.value,
                                        })
                                    }
                                />
                            </EditorField>
                            <EditorField label="적용 단계">
                                <Select
                                    value={script.phase}
                                    onValueChange={(next) =>
                                        updateRegex(index, {
                                            ...script,
                                            phase: next as RegexScript['phase'],
                                        })
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent align="start">
                                        <SelectItem value="editinput">입력 편집</SelectItem>
                                        <SelectItem value="editprocess">처리 편집</SelectItem>
                                        <SelectItem value="editoutput">출력 편집</SelectItem>
                                        <SelectItem value="editdisplay">표시 편집</SelectItem>
                                    </SelectContent>
                                </Select>
                            </EditorField>
                            <EditorField label="플래그">
                                <Input
                                    value={script.flags}
                                    onChange={(event) =>
                                        updateRegex(index, {
                                            ...script,
                                            flags: event.target.value,
                                        })
                                    }
                                />
                            </EditorField>
                            <EditorField label="패턴">
                                <Textarea
                                    rows={5}
                                    value={script.pattern}
                                    onChange={(event) =>
                                        updateRegex(index, {
                                            ...script,
                                            pattern: event.target.value,
                                        })
                                    }
                                />
                            </EditorField>
                            <EditorField label="치환문">
                                <Textarea
                                    rows={5}
                                    value={script.replacement}
                                    onChange={(event) =>
                                        updateRegex(index, {
                                            ...script,
                                            replacement: event.target.value,
                                        })
                                    }
                                />
                            </EditorField>
                            <Button
                                type="button"
                                variant="ghost"
                                className="justify-start text-destructive hover:text-destructive"
                                onClick={() =>
                                    field(
                                        'regexScripts',
                                        regexScripts.filter((_, itemIndex) => itemIndex !== index),
                                    )
                                }
                            >
                                <Trash aria-hidden="true" /> 정규식 삭제
                            </Button>
                        </SettingsGroup>
                    ))}
                    <SettingsGroup
                        title="보존 자산"
                        meta={`${assets.length}개`}
                        contentClassName="grid gap-2"
                    >
                        <p className="text-[10px] leading-4 text-muted-foreground">
                            CHARX round-trip을 위해 보관된 파일입니다. 대표 이미지 외에는 실행하지
                            않습니다.
                        </p>
                        {assets.length ? (
                            <PreservedAssetList assets={assets} />
                        ) : (
                            <p className="py-2 text-center text-[10px] text-muted-foreground">
                                보존된 자산이 없습니다.
                            </p>
                        )}
                    </SettingsGroup>
                </div>
            ) : null}
        </>
    )
}

function PreservedAssetList({ assets }: { assets: CharacterAsset[] }) {
    const { listRef, virtualizer } = useScrollParentVirtualizer<HTMLDivElement>({
        count: assets.length,
        estimateSize: () => 45,
        getItemKey: (index) => `${assets[index]!.assetId}-${assets[index]!.sourceUri}`,
        overscan: 12,
    })
    const scrollMargin = virtualizer.options.scrollMargin

    return (
        <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => {
                const asset = assets[row.index]!
                return (
                    <div
                        key={row.key}
                        ref={virtualizer.measureElement}
                        data-index={row.index}
                        className={`absolute left-0 top-0 grid w-full grid-cols-[auto_1fr] items-center gap-2 border-sidebar-border py-2 ${row.index ? 'border-t' : ''}`}
                        style={{ transform: `translateY(${row.start - scrollMargin}px)` }}
                    >
                        <FileArchive aria-hidden="true" className="text-muted-foreground" />
                        <span className="min-w-0">
                            <strong className="block truncate text-xs">
                                {asset.name || asset.sourceUri || 'unnamed'}
                            </strong>
                            <small className="text-[9px] text-muted-foreground">
                                {asset.mimeType} · {formatBytes(asset.size)}
                            </small>
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

function EditorField({
    label,
    note,
    children,
}: {
    label: string
    note?: string
    children: ReactNode
}) {
    return (
        <Label className="grid min-w-0 gap-1.5">
            <span className="flex items-center justify-between gap-3">
                <span>{label}</span>
                {note ? <small className="font-normal text-muted-foreground">{note}</small> : null}
            </span>
            {children}
        </Label>
    )
}

function splitValues(value: string, separator: ',' | '\n') {
    return value
        .split(separator)
        .map((item) => item.trim())
        .filter(Boolean)
}

function optionalNumber(value: string) {
    return value === '' ? undefined : Number(value)
}

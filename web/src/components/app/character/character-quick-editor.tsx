import type {
    Character,
    CharacterAsset,
    CharacterUpdate,
    LoreEntry,
    RegexScript,
} from '@malang/shared'
import {
    BookOpenText,
    BracketsCurly,
    CheckCircle,
    Cube,
    DownloadSimple,
    ImageSquare,
    Quotes,
    Trash,
    UserCircle,
    Waveform,
} from '@phosphor-icons/react'
import { useAtomValue, useSetAtom } from 'jotai'
import { type ChangeEvent, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { characterExportUrl } from '@/lib/api'
import { useDebouncedSave } from '@/lib/use-debounced-save'

import { personaListAtom, selectedPersonaIdAtom, selectPersonaAtom } from '../settings/persona/atom'
import type { CharacterEditorSection } from '../workspace/types'
import { CharacterAvatar } from './character-avatar'
import { CharacterEditorSections } from './character-editor-sections'
import { draftFrom, replaceRegex } from './model'

export function CharacterQuickEditor({
    character,
    assets,
    section,
    onSectionChange,
    onSave,
    onAvatar,
    onRemoveAvatar,
    onArchive,
}: {
    character: Character
    assets: CharacterAsset[]
    section: CharacterEditorSection
    onSectionChange: (section: CharacterEditorSection) => void
    onSave: (input: CharacterUpdate) => Promise<void>
    onAvatar: (file: File) => Promise<void>
    onRemoveAvatar: () => Promise<void>
    onArchive: () => void
}) {
    const initialDraft = draftFrom(character)
    const [draft, setDraft] = useState<CharacterUpdate>(initialDraft)
    const [selectedLoreId, setSelectedLoreId] = useState<string | null>(
        initialDraft.lorebook?.[0]?.id ?? null,
    )
    const [avatarSaving, setAvatarSaving] = useState(false)
    const avatarInput = useRef<HTMLInputElement>(null)
    const lorebook = draft.lorebook ?? []
    const regexScripts = draft.regexScripts ?? []
    const selectedLore =
        lorebook.find((entry) => entry.id === selectedLoreId) ?? lorebook[0] ?? null

    const sections = [
        { id: 'profile' as const, label: '기본 정보', icon: UserCircle },
        { id: 'display' as const, label: '디스플레이', icon: ImageSquare },
        { id: 'greetings' as const, label: '첫 대화', icon: Quotes },
        { id: 'lorebook' as const, label: '로어북', icon: BookOpenText },
        { id: 'prompt' as const, label: '프롬프트', icon: BracketsCurly },
        { id: 'advanced' as const, label: '고급 설정', icon: Waveform },
    ]

    function field<K extends keyof CharacterUpdate>(key: K, value: CharacterUpdate[K]) {
        setDraft((current) => ({ ...current, [key]: value }))
    }

    const autoSave = useDebouncedSave(
        draft,
        async (next) => {
            if (!next.name?.trim()) return
            await onSave({ ...next, name: next.name.trim() })
        },
        { enabled: Boolean(draft.name?.trim()) },
    )

    async function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        setAvatarSaving(true)
        try {
            await onAvatar(file)
        } finally {
            setAvatarSaving(false)
        }
    }

    async function handleRemoveAvatar() {
        setAvatarSaving(true)
        try {
            await onRemoveAvatar()
        } finally {
            setAvatarSaving(false)
        }
    }

    function updateLore(next: LoreEntry) {
        field(
            'lorebook',
            lorebook.map((entry) => (entry.id === next.id ? next : entry)),
        )
    }

    function updateRegex(index: number, next: RegexScript) {
        field('regexScripts', replaceRegex(regexScripts, index, next))
    }

    return (
        <section
            className="grid min-h-0 min-w-0 grid-cols-[14rem_minmax(0,1fr)] grid-rows-[4rem_minmax(0,1fr)_auto] bg-background max-[1024px]:grid-cols-[4.5rem_minmax(0,1fr)] max-sm:grid-cols-1 max-sm:grid-rows-[4rem_auto_minmax(0,1fr)_auto]"
            onBlurCapture={() => void autoSave.flush()}
        >
            <header className="col-span-2 flex items-center gap-3 border-b border-border bg-background/90 px-5 backdrop-blur-md max-sm:col-span-1 max-sm:px-3 [&_.avatar]:size-10">
                <span
                    className="hidden size-[2.75rem] shrink-0 max-[820px]:block"
                    aria-hidden="true"
                />
                <CharacterAvatar character={character} />
                <div className="min-w-0 flex-1">
                    <h2 className="truncate font-serif text-lg">{draft.name || character.name}</h2>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground max-sm:hidden">
                    <CheckCircle aria-hidden="true" className="text-primary" /> 자동 저장
                </span>
            </header>

            <div
                className="row-start-2 flex min-h-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3 max-[1024px]:px-2 max-sm:row-start-2 max-sm:grid max-sm:grid-cols-6 max-sm:border-b max-sm:border-r-0 max-sm:p-0"
                role="tablist"
                aria-label="캐릭터 설정 영역"
            >
                {sections.map((item) => {
                    const Icon = item.icon
                    return (
                        <Button
                            key={item.id}
                            type="button"
                            variant="ghost"
                            role="tab"
                            aria-selected={section === item.id}
                            aria-label={item.label}
                            title={item.label}
                            className="relative h-10 min-w-0 justify-start gap-2 border-0 bg-transparent px-3 text-muted-foreground hover:bg-selection hover:text-foreground active:not-aria-[haspopup]:translate-y-0 aria-selected:bg-selection-strong aria-selected:text-foreground aria-selected:before:absolute aria-selected:before:inset-y-2 aria-selected:before:left-0 aria-selected:before:w-0.5 aria-selected:before:bg-primary max-[1024px]:justify-center max-[1024px]:px-0 max-sm:h-11 max-sm:rounded-none max-sm:aria-selected:before:inset-x-3 max-sm:aria-selected:before:bottom-0 max-sm:aria-selected:before:left-auto max-sm:aria-selected:before:top-auto max-sm:aria-selected:before:h-px max-sm:aria-selected:before:w-auto"
                            onClick={() => onSectionChange(item.id)}
                        >
                            <Icon aria-hidden="true" />
                            <span className="max-[1024px]:sr-only">{item.label}</span>
                        </Button>
                    )
                })}
            </div>

            <div className="row-start-2 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-6 py-7 max-sm:row-start-3 max-sm:px-4 [&_input]:min-w-0 [&_label]:min-w-0 [&_label]:text-xs [&_label]:font-medium [&_label]:text-muted-foreground [&_textarea]:field-sizing-fixed [&_textarea]:resize-y">
                <div className="mx-auto w-full max-w-4xl">
                    <div className="mb-6 flex items-end justify-between gap-3 border-b border-border pb-3">
                        <div className="min-w-0">
                            <h3 className="font-serif text-2xl">
                                {sections.find((item) => item.id === section)?.label}
                            </h3>
                        </div>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                            CC{character.sourceSpec.toUpperCase()} CARD
                        </span>
                    </div>

                    <CharacterEditorSections
                        section={section}
                        character={character}
                        assets={assets}
                        draft={draft}
                        field={field}
                        avatarSaving={avatarSaving}
                        avatarInput={avatarInput}
                        handleAvatar={handleAvatar}
                        handleRemoveAvatar={handleRemoveAvatar}
                        lorebook={lorebook}
                        selectedLoreId={selectedLoreId}
                        setSelectedLoreId={setSelectedLoreId}
                        selectedLore={selectedLore}
                        updateLore={updateLore}
                        regexScripts={regexScripts}
                        updateRegex={updateRegex}
                    />

                    {section === 'advanced' ? (
                        <div className="mt-10 border-t border-border pt-5">
                            <div className="mb-3 flex items-end justify-between gap-3">
                                <div>
                                    <h4 className="font-serif text-lg">캐릭터 관리</h4>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Button
                                    type="button"
                                    size="lg"
                                    variant="outline"
                                    className="w-full justify-start"
                                    render={
                                        <a
                                            href={characterExportUrl(character.id, 'v3', 'charx')}
                                            download={`${safeExportName(draft.name || character.name)}.charx`}
                                            aria-label="캐릭터를 CHARX 파일로 엑스포트"
                                            onClick={() => void autoSave.flush()}
                                        />
                                    }
                                >
                                    <DownloadSimple aria-hidden="true" />
                                    <span>캐릭터 엑스포트</span>
                                    <span className="ml-auto font-mono text-[9px] font-normal text-muted-foreground">
                                        CCV3 · CHARX
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    size="lg"
                                    variant="outline"
                                    className="w-full justify-start"
                                    disabled
                                    title="추후 지원 예정"
                                >
                                    <Cube aria-hidden="true" />
                                    <span>모듈로 변환</span>
                                    <span className="ml-auto font-mono text-[9px] font-normal">
                                        준비 중
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    size="lg"
                                    variant="destructive"
                                    className="w-full justify-start border border-destructive/25"
                                    onClick={onArchive}
                                >
                                    <Trash aria-hidden="true" /> 캐릭터 삭제
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <footer className="col-span-2 flex items-center justify-between border-t border-border bg-card px-5 py-2 max-sm:col-span-1">
                <span className="text-[9px] leading-4 text-muted-foreground">
                    변경사항은 자동으로 저장됩니다.
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                    {character.creator || 'LOCAL CHARACTER'}
                </span>
            </footer>
        </section>
    )
}

function safeExportName(name: string) {
    return name.trim().replace(/[<>:"/\\|?*]/g, '_') || 'character'
}

export function GlobalPersonaRow() {
    const personas = useAtomValue(personaListAtom)
    const personaId = useAtomValue(selectedPersonaIdAtom)
    const selectPersona = useSetAtom(selectPersonaAtom)

    return (
        <Label className="grid gap-1 [&>span:first-child]:font-mono [&>span:first-child]:text-[9px] [&>span:first-child]:tracking-widest [&>span:first-child]:text-muted-foreground">
            <span>전역 페르소나</span>
            <Select
                value={personaId ?? '__legacy__'}
                onValueChange={(next) =>
                    void selectPersona(next === '__legacy__' ? null : (next as string))
                }
            >
                <SelectTrigger className="w-full">
                    <SelectValue placeholder="페르소나 선택" />
                </SelectTrigger>
                <SelectContent align="start">
                    <SelectItem value="__legacy__">기본 사용자 정보</SelectItem>
                    {personas.map((persona) => (
                        <SelectItem key={persona.id} value={persona.id}>
                            {persona.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Label>
    )
}

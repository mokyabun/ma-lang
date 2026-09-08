import type {
    Character,
    Conversation,
    ConversationModuleState,
    LongTermMemorySettings,
    LongTermMemoryState,
    PromptPreset,
    PromptPreview,
} from '@malang/shared'
import { BookOpenText, Brain, Star, Trash, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

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
import { Sheet, SheetClose, SheetContent } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { activePromptToggles } from '@/lib/prompt-toggles'
import { useDebouncedSave } from '@/lib/use-debounced-save'

import { CharacterAvatar } from '../character/character-avatar'

export function ChatInspector({
    open,
    character,
    conversation,
    presets,
    promptPresetId,
    promptToggleValues,
    moduleStates,
    onClose,
    onUpdate,
    onPromptToggleValuesChange,
    onPreview,
    onArchive,
}: {
    open: boolean
    character: Character
    conversation: Conversation
    presets: PromptPreset[]
    promptPresetId: string
    promptToggleValues: Record<string, string>
    moduleStates: ConversationModuleState[]
    onClose: () => void
    onUpdate: (input: Partial<Pick<Conversation, 'title' | 'authorNote' | 'variables'>>) => void
    onPromptToggleValuesChange: (values: Record<string, string>) => void | Promise<void>
    onPreview: () => Promise<PromptPreview>
    onArchive: () => void
}) {
    const [title, setTitle] = useState(conversation.title)
    const [authorNote, setAuthorNote] = useState(conversation.authorNote)
    const [variables, setVariables] = useState(JSON.stringify(conversation.variables, null, 2))
    const [toggleValues, setToggleValues] = useState(promptToggleValues)
    const [preview, setPreview] = useState<PromptPreview | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [memory, setMemory] = useState<LongTermMemoryState | null>(null)
    const [memoryConversationId, setMemoryConversationId] = useState('')
    const [memoryError, setMemoryError] = useState('')
    const [memoryErrorConversationId, setMemoryErrorConversationId] = useState('')
    const currentMemory = memoryConversationId === conversation.id ? memory : null
    const currentMemoryError = memoryErrorConversationId === conversation.id ? memoryError : ''
    const memoryLoading = open && !currentMemory && !currentMemoryError
    const selectedPreset = presets.find((preset) => preset.id === promptPresetId) || null
    const promptToggles = activePromptToggles(selectedPreset, moduleStates)
    const parsedVariables = useMemo(() => {
        try {
            return JSON.parse(variables) as Record<string, string>
        } catch {
            return null
        }
    }, [variables])
    const settingsDraft = useMemo(
        () => ({ title, authorNote, variables: parsedVariables }),
        [authorNote, parsedVariables, title],
    )
    const autoSave = useDebouncedSave(
        settingsDraft,
        async (next) => {
            if (!next.variables || !next.title.trim()) return
            onUpdate({
                title: next.title.trim(),
                authorNote: next.authorNote,
                variables: next.variables,
            })
        },
        { enabled: Boolean(title.trim() && parsedVariables) },
    )
    const toggleAutoSave = useDebouncedSave(
        toggleValues,
        async (next) => onPromptToggleValuesChange(next),
        { delay: 350 },
    )

    useEffect(() => {
        if (!open) return
        let active = true
        void api
            .longTermMemory(conversation.id)
            .then((state) => {
                if (active) {
                    setMemory(state)
                    setMemoryConversationId(conversation.id)
                    setMemoryError('')
                    setMemoryErrorConversationId('')
                }
            })
            .catch((error: unknown) => {
                if (active) {
                    setMemoryError(
                        error instanceof Error ? error.message : '장기 기억을 불러오지 못했습니다.',
                    )
                    setMemoryErrorConversationId(conversation.id)
                }
            })
        return () => {
            active = false
        }
    }, [conversation.id, open])

    async function updateMemorySettings(patch: Partial<LongTermMemorySettings>) {
        setMemoryError('')
        try {
            setMemory(await api.updateLongTermMemory(conversation.id, patch))
            setMemoryConversationId(conversation.id)
        } catch (error) {
            setMemoryError(error instanceof Error ? error.message : '장기 기억 설정 저장 실패')
            setMemoryErrorConversationId(conversation.id)
        }
    }

    async function toggleImportant(summaryId: string, isImportant: boolean) {
        if (!currentMemory) return
        try {
            const summary = await api.updateLongTermMemorySummary(conversation.id, summaryId, {
                isImportant,
            })
            setMemory({
                ...currentMemory,
                summaries: currentMemory.summaries.map((item) =>
                    item.id === summary.id ? summary : item,
                ),
            })
        } catch (error) {
            setMemoryError(error instanceof Error ? error.message : '기억 업데이트 실패')
            setMemoryErrorConversationId(conversation.id)
        }
    }

    async function deleteMemorySummary(summaryId: string) {
        if (!currentMemory) return
        try {
            await api.deleteLongTermMemorySummary(conversation.id, summaryId)
            setMemory({
                ...currentMemory,
                summaries: currentMemory.summaries.filter((item) => item.id !== summaryId),
            })
        } catch (error) {
            setMemoryError(error instanceof Error ? error.message : '기억 삭제 실패')
            setMemoryErrorConversationId(conversation.id)
        }
    }

    async function clearMemory() {
        if (!currentMemory || !window.confirm('이 대화의 장기 기억 요약을 모두 삭제할까요?')) return
        try {
            await api.clearLongTermMemory(conversation.id)
            setMemory({
                ...currentMemory,
                summaries: [],
                metrics: {
                    importantSummaryIds: [],
                    recentSummaryIds: [],
                    similarSummaryIds: [],
                    randomSummaryIds: [],
                },
            })
        } catch (error) {
            setMemoryError(error instanceof Error ? error.message : '장기 기억 초기화 실패')
            setMemoryErrorConversationId(conversation.id)
        }
    }

    function updateToggle(key: string, value: string, immediate = false) {
        const toggles = { ...toggleValues, [key]: value }
        setToggleValues(toggles)
        if (immediate) {
            void toggleAutoSave.saveNow(toggles)
        }
    }

    async function loadPreview() {
        setPreviewLoading(true)
        try {
            setPreview(await onPreview())
        } finally {
            setPreviewLoading(false)
        }
    }

    function changeOpen(nextOpen: boolean) {
        if (nextOpen) return
        void autoSave.flush()
        void toggleAutoSave.flush()
        onClose()
    }

    return (
        <Sheet open={open} onOpenChange={changeOpen}>
            <SheetContent
                side="right"
                showCloseButton={false}
                className="w-[min(24rem,calc(100%-1rem))] max-w-none border-l border-border bg-card p-0 shadow-2xl sm:max-w-none [&>header]:flex [&>header]:min-h-20 [&>header]:items-center [&>header]:justify-between [&>header]:border-b [&>header]:border-border [&>header]:px-5 [&>header_h3]:font-serif [&>header_h3]:text-xl"
                onBlurCapture={() => {
                    void autoSave.flush()
                    void toggleAutoSave.flush()
                }}
            >
                <header>
                    <h3>대화 설정</h3>
                    <SheetClose
                        render={
                            <Button
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground"
                                aria-label="대화 설정 닫기"
                            />
                        }
                    >
                        <X aria-hidden="true" />
                    </SheetClose>
                </header>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 border-b border-border pb-5 [&_.avatar]:row-span-2 [&_.avatar]:size-14 [&>strong]:self-end [&>strong]:truncate [&>span]:self-start [&>span]:truncate [&>span]:text-xs [&>span]:text-muted-foreground">
                        <CharacterAvatar character={character} />
                        <strong>{character.name}</strong>
                        <span>
                            {character.creator ? `by ${character.creator}` : 'local character card'}
                        </span>
                    </div>
                    <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                        대화 제목
                        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                    </Label>
                    <p className="text-[10px] leading-5 text-muted-foreground">
                        전역 프리셋과 페르소나, 이 대화의 모듈은 목록 아래 패널에서 바로 전환할 수
                        있습니다.
                    </p>
                    {promptToggles.length ? (
                        <section className="grid gap-2 border-y border-border py-3 [&>header]:flex [&>header]:items-center [&>header]:justify-between [&>header]:gap-3 [&>header>span]:font-mono [&>header>span]:text-[10px] [&>header>small]:text-[10px] [&>header>small]:text-muted-foreground">
                            <header>
                                <span>GLOBAL PROMPT TOGGLES</span>
                                <small>
                                    {selectedPreset?.name || '활성 모듈'} · 모든 대화 공유
                                </small>
                            </header>
                            <div className="col-span-full mt-2 grid gap-2 border-t border-border pt-2">
                                {promptToggles.map((toggle, index) => {
                                    if (toggle.type === 'group' || toggle.type === 'caption') {
                                        return (
                                            <strong key={`${toggle.type}-${index}`}>
                                                {toggle.label}
                                            </strong>
                                        )
                                    }
                                    if (toggle.type === 'groupEnd') return null
                                    if (toggle.type === 'divider') {
                                        return <hr key={`divider-${index}`} />
                                    }
                                    const value = toggleValues[toggle.key] ?? toggle.defaultValue
                                    return (
                                        <Label key={`${toggle.key}-${index}`}>
                                            <span>{toggle.label}</span>
                                            {toggle.type === 'boolean' ? (
                                                <Checkbox
                                                    checked={value === '1' || value === 'true'}
                                                    onCheckedChange={(checked) =>
                                                        updateToggle(
                                                            toggle.key,
                                                            checked ? '1' : '0',
                                                            true,
                                                        )
                                                    }
                                                />
                                            ) : toggle.type === 'select' ? (
                                                <Select
                                                    value={value}
                                                    onValueChange={(next) =>
                                                        updateToggle(
                                                            toggle.key,
                                                            next as string,
                                                            true,
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="값 선택" />
                                                    </SelectTrigger>
                                                    <SelectContent align="start">
                                                        {toggle.options.map(
                                                            (option, optionIndex) => (
                                                                <SelectItem
                                                                    key={`${option}-${optionIndex}`}
                                                                    value={String(optionIndex)}
                                                                >
                                                                    {option}
                                                                </SelectItem>
                                                            ),
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            ) : toggle.type === 'textarea' ? (
                                                <Textarea
                                                    value={value}
                                                    onChange={(event) =>
                                                        updateToggle(toggle.key, event.target.value)
                                                    }
                                                />
                                            ) : (
                                                <Input
                                                    value={value}
                                                    onChange={(event) =>
                                                        updateToggle(toggle.key, event.target.value)
                                                    }
                                                />
                                            )}
                                        </Label>
                                    )
                                })}
                            </div>
                        </section>
                    ) : null}
                    <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                        Author note
                        <Textarea
                            rows={6}
                            value={authorNote}
                            onChange={(event) => setAuthorNote(event.target.value)}
                        />
                    </Label>
                    <Collapsible className="border-y border-border py-3">
                        <CollapsibleTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    className="flex w-full justify-between px-0"
                                />
                            }
                        >
                            <span className="flex items-center gap-2">
                                <Brain aria-hidden="true" /> 하이파 메모리 V3
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                                {memoryLoading
                                    ? 'LOADING'
                                    : `${currentMemory?.summaries.length || 0} MEMORIES`}
                            </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 pt-3 text-xs">
                            {currentMemory ? (
                                <>
                                    <Label className="flex items-center justify-between gap-3">
                                        <span>
                                            장기 기억 사용
                                            <small className="block text-[10px] text-muted-foreground">
                                                보조 모델로 오래된 대화를 요약합니다.
                                            </small>
                                        </span>
                                        <Checkbox
                                            checked={currentMemory.settings.enabled}
                                            onCheckedChange={(checked) =>
                                                void updateMemorySettings({
                                                    enabled: checked === true,
                                                })
                                            }
                                        />
                                    </Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <MemoryNumberInput
                                            label="메모리 비율"
                                            value={currentMemory.settings.memoryTokensRatio}
                                            min={0.01}
                                            max={0.5}
                                            step={0.05}
                                            onChange={(memoryTokensRatio) =>
                                                void updateMemorySettings({ memoryTokensRatio })
                                            }
                                        />
                                        <MemoryNumberInput
                                            label="요약당 메시지"
                                            value={currentMemory.settings.maxMessagesPerSummary}
                                            min={2}
                                            max={50}
                                            step={1}
                                            onChange={(maxMessagesPerSummary) =>
                                                void updateMemorySettings({ maxMessagesPerSummary })
                                            }
                                        />
                                        <MemoryNumberInput
                                            label="최근 기억 비율"
                                            value={currentMemory.settings.recentMemoryRatio}
                                            min={0}
                                            max={1 - currentMemory.settings.similarMemoryRatio}
                                            step={0.05}
                                            onChange={(recentMemoryRatio) =>
                                                void updateMemorySettings({ recentMemoryRatio })
                                            }
                                        />
                                        <MemoryNumberInput
                                            label="유사 기억 비율"
                                            value={currentMemory.settings.similarMemoryRatio}
                                            min={0}
                                            max={1 - currentMemory.settings.recentMemoryRatio}
                                            step={0.05}
                                            onChange={(similarMemoryRatio) =>
                                                void updateMemorySettings({ similarMemoryRatio })
                                            }
                                        />
                                    </div>
                                    <p className="text-[10px] leading-5 text-muted-foreground">
                                        나머지 비율은 무작위 기억에 사용됩니다. 유사도 검색은 로컬
                                        문자 n-gram 벡터로 동작합니다.
                                    </p>
                                    {currentMemory.summaries.length ? (
                                        <div className="space-y-2 border-t border-border pt-3">
                                            <div className="flex items-center justify-between">
                                                <strong>저장된 요약</strong>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => void clearMemory()}
                                                >
                                                    모두 지우기
                                                </Button>
                                            </div>
                                            {currentMemory.summaries.map((summary) => (
                                                <article
                                                    key={summary.id}
                                                    className="rounded-md border border-border p-3"
                                                >
                                                    <p className="line-clamp-5 whitespace-pre-wrap text-[11px] leading-5">
                                                        {summary.text}
                                                    </p>
                                                    <footer className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
                                                        <span>
                                                            메시지 {summary.sourceMessageIds.length}
                                                            개
                                                        </span>
                                                        <span className="flex gap-1">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                aria-label={
                                                                    summary.isImportant
                                                                        ? '중요 기억 해제'
                                                                        : '중요 기억 지정'
                                                                }
                                                                onClick={() =>
                                                                    void toggleImportant(
                                                                        summary.id,
                                                                        !summary.isImportant,
                                                                    )
                                                                }
                                                            >
                                                                <Star
                                                                    weight={
                                                                        summary.isImportant
                                                                            ? 'fill'
                                                                            : 'regular'
                                                                    }
                                                                />
                                                            </Button>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                aria-label="기억 삭제"
                                                                onClick={() =>
                                                                    void deleteMemorySummary(
                                                                        summary.id,
                                                                    )
                                                                }
                                                            >
                                                                <Trash />
                                                            </Button>
                                                        </span>
                                                    </footer>
                                                </article>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="rounded-md bg-secondary/50 p-3 text-[10px] text-muted-foreground">
                                            컨텍스트가 가득 차기 시작하면 오래된 대화가 자동으로
                                            요약됩니다.
                                        </p>
                                    )}
                                </>
                            ) : null}
                            {currentMemoryError ? (
                                <p className="text-[10px] text-destructive">{currentMemoryError}</p>
                            ) : null}
                        </CollapsibleContent>
                    </Collapsible>
                    <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                        대화 변수 · JSON
                        <Textarea
                            className="font-mono text-[10px]"
                            rows={7}
                            value={variables}
                            onChange={(event) => setVariables(event.target.value)}
                        />
                        {!parsedVariables ? (
                            <span className="text-[10px] text-destructive">
                                올바른 JSON이 아닙니다.
                            </span>
                        ) : null}
                    </Label>
                    {character.tags.length ? (
                        <div className="flex flex-wrap gap-1.5 [&>span]:rounded-full [&>span]:bg-secondary [&>span]:px-2 [&>span]:py-1 [&>span]:text-[9px]">
                            {character.tags.map((tag) => (
                                <span key={tag}>{tag}</span>
                            ))}
                        </div>
                    ) : null}
                    <section className="flex gap-3 border-l-2 border-primary/50 bg-primary/5 p-3">
                        <BookOpenText aria-hidden="true" />
                        <div>
                            <h4>Character note</h4>
                            <p>{character.description || '이 카드에는 공개 설명이 없습니다.'}</p>
                        </div>
                    </section>
                    <dl className="grid grid-cols-3 divide-x divide-border border-y border-border py-3 text-center [&_dd]:m-0 [&_dd]:font-mono [&_dd]:text-[10px] [&_dt]:text-[9px] [&_dt]:text-muted-foreground">
                        <div>
                            <dt>Card spec</dt>
                            <dd>CC{character.sourceSpec.toUpperCase()}</dd>
                        </div>
                        <div>
                            <dt>Lore entries</dt>
                            <dd>{character.lorebook?.length || 0}</dd>
                        </div>
                        <div>
                            <dt>Variables</dt>
                            <dd>{Object.keys(conversation.variables).length}</dd>
                        </div>
                    </dl>
                    <section className="space-y-3 border-t border-border pt-4 text-xs [&_pre]:max-h-64 [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
                        <Button
                            size="lg"
                            variant="outline"
                            onClick={() => void loadPreview()}
                            disabled={previewLoading}
                        >
                            <BookOpenText /> {previewLoading ? '컴파일 중' : '프롬프트 미리보기'}
                        </Button>
                        {preview ? (
                            <div>
                                <p>
                                    <strong>{preview.estimatedInputTokens.toLocaleString()}</strong>{' '}
                                    input tokens ·{' '}
                                    <strong>{preview.reservedOutputTokens.toLocaleString()}</strong>{' '}
                                    reserved
                                </p>
                                <p>
                                    {preview.activatedLoreIds.length} lore active ·{' '}
                                    {preview.trimmedMessageIds.length} messages trimmed
                                </p>
                                {preview.warnings.map((warning) => (
                                    <small key={warning}>{warning}</small>
                                ))}
                                <Collapsible>
                                    <CollapsibleTrigger render={<Button variant="outline" />}>
                                        컴파일된 메시지 {preview.messages.length}개
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        {preview.messages.map((message, index) => (
                                            <article key={index}>
                                                <span>{message.role}</span>
                                                <pre>{message.content}</pre>
                                            </article>
                                        ))}
                                    </CollapsibleContent>
                                </Collapsible>
                            </div>
                        ) : null}
                    </section>
                </div>
                <Button size="lg" variant="destructive" onClick={onArchive}>
                    <Trash aria-hidden="true" /> 대화 삭제
                </Button>
            </SheetContent>
        </Sheet>
    )
}

function MemoryNumberInput({
    label,
    value,
    min,
    max,
    step,
    onChange,
}: {
    label: string
    value: number
    min: number
    max: number
    step: number
    onChange: (value: number) => void
}) {
    return (
        <Label className="grid gap-1 text-[10px] text-muted-foreground">
            {label}
            <Input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isFinite(next) && next >= min && next <= max) onChange(next)
                }}
            />
        </Label>
    )
}

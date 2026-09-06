import type {
    Character,
    CharacterAsset,
    GenerationRun,
    Message,
    ModuleAsset,
    Persona,
} from '@malang/shared'
import {
    ArrowClockwise,
    ArrowLeft,
    ArrowRight,
    Check,
    ClockCounterClockwise,
    Copy,
    PencilSimple,
    Trash,
    X,
} from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Textarea } from '@/components/ui/textarea'
import { api, getClientInstanceId } from '@/lib/api'
import { expandMessageImages } from '@/lib/message-images'
import { renderMessageHtml } from '@/lib/sanitize-message-html'
import { cn } from '@/lib/utils'

import { CharacterAvatar } from '../character/character-avatar'
import { PersonaAvatar } from '../settings/persona/persona-avatar'
import { formatClock, statusLabel } from './format'

interface TranscriptScrollSnapshot {
    top: number
    atBottom: boolean
}

const transcriptScrollPositions = new Map<string, TranscriptScrollSnapshot>()
const MAX_SAVED_TRANSCRIPTS = 50

export function MessageTranscript({
    character,
    conversationId,
    imageAssets,
    userName,
    userPersona,
    messages,
    loading,
    greetingIndex,
    greetingCount,
    onRegenerate,
    onSelectGreeting,
    onEdit,
    onDelete,
    onVersions,
    onSelectVersion,
    onLuaTriggered,
}: {
    character: Character
    conversationId: string
    imageAssets: Array<CharacterAsset | ModuleAsset>
    userName: string
    userPersona: Persona | null
    messages: Message[]
    loading: boolean
    greetingIndex: number
    greetingCount: number
    onRegenerate: () => void
    onSelectGreeting: (greetingIndex: number) => Promise<void>
    onEdit: (message: Message, content: string) => Promise<void>
    onDelete: (message: Message, scope: 'only' | 'from') => Promise<void>
    onVersions: (message: Message) => Promise<{ generations: GenerationRun[] }>
    onSelectVersion: (message: Message, generationId: string) => Promise<void>
    onLuaTriggered: () => void | Promise<void>
}) {
    const viewportRef = useRef<HTMLDivElement>(null)
    const restoredConversationRef = useRef<string | null>(null)
    const atBottomRef = useRef(true)
    const pendingScrollTopRef = useRef<number | null>(null)
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
    const hasUserMessage = messages.some((message) => message.role === 'user')
    const canSelectGreeting = !hasUserMessage && greetingCount > 1

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport || (loading && !messages.length)) return

        if (restoredConversationRef.current !== conversationId) {
            const saved = transcriptScrollPositions.get(conversationId)
            viewport.scrollTop = saved && !saved.atBottom ? saved.top : viewport.scrollHeight
            atBottomRef.current = saved?.atBottom ?? true
            restoredConversationRef.current = conversationId
            return
        }

        if (atBottomRef.current) viewport.scrollTop = viewport.scrollHeight
    }, [conversationId, loading, messages])

    useLayoutEffect(
        () => () => {
            const viewport = viewportRef.current
            if (viewport) rememberTranscriptScroll(conversationId, viewport)
        },
        [conversationId],
    )

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        const pendingScrollTop = pendingScrollTopRef.current
        if (!viewport || pendingScrollTop === null) return

        viewport.scrollTop = pendingScrollTop
        pendingScrollTopRef.current = null
        atBottomRef.current = isNearBottom(viewport)
        rememberTranscriptScroll(conversationId, viewport)
    }, [conversationId, editingMessageId])

    function changeEditingMessage(messageId: string | null) {
        const viewport = viewportRef.current
        if (viewport) {
            pendingScrollTopRef.current = viewport.scrollTop
            atBottomRef.current = false
        }
        setEditingMessageId(messageId)
    }

    function handleScroll() {
        const viewport = viewportRef.current
        if (!viewport) return
        atBottomRef.current = isNearBottom(viewport)
        rememberTranscriptScroll(conversationId, viewport)
    }

    async function handleLuaClick(event: MouseEvent) {
        const target = event.target instanceof Element ? event.target : null
        const trigger = target?.closest<HTMLElement>('[risu-trigger], [risu-btn]')
        if (!trigger || !viewportRef.current?.contains(trigger)) return
        event.preventDefault()
        const existingKey = trigger.dataset.malangLuaPending
        if (existingKey) return
        const idempotencyKey = crypto.randomUUID()
        trigger.dataset.malangLuaPending = idempotencyKey
        const disableable = trigger as HTMLElement & { disabled?: boolean }
        const wasDisabled = disableable.disabled
        disableable.disabled = true
        try {
            const article = trigger.closest<HTMLElement>('[data-message-id]')
            const common = {
                idempotencyKey,
                clientInstanceId: getClientInstanceId(),
                sourceMessageId: article?.dataset.messageId ?? null,
                triggerElementId: trigger.getAttribute('risu-id'),
            }
            await api.triggerLua(
                conversationId,
                trigger.hasAttribute('risu-trigger')
                    ? {
                          type: 'manual',
                          name: trigger.getAttribute('risu-trigger') || '',
                          ...common,
                      }
                    : {
                          type: 'button',
                          data: trigger.getAttribute('risu-btn') || '',
                          ...common,
                      },
            )
            await onLuaTriggered()
        } finally {
            disableable.disabled = wasDisabled
            delete trigger.dataset.malangLuaPending
        }
    }

    function handleLuaKeyDown(event: KeyboardEvent) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        const target = event.target instanceof Element ? event.target : null
        const trigger = target?.closest<HTMLElement>('[risu-trigger], [risu-btn]')
        if (!trigger || !viewportRef.current?.contains(trigger)) return
        event.preventDefault()
        trigger.click()
    }

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return
        viewport.addEventListener('click', handleLuaClick)
        viewport.addEventListener('keydown', handleLuaKeyDown)
        return () => {
            viewport.removeEventListener('click', handleLuaClick)
            viewport.removeEventListener('keydown', handleLuaKeyDown)
        }
    })

    return (
        <div
            ref={viewportRef}
            id="malang-chat-theme"
            className="malang-transcript min-h-0 overflow-y-auto"
            onScroll={handleScroll}
        >
            <div className="malang-transcript__inner mx-auto py-5 sm:py-8">
                <div className="malang-scene-marker mb-5 flex items-center gap-4 px-2 font-mono text-[8px] uppercase tracking-widest text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border sm:mb-7">
                    <span>SCENE</span>
                    <p>{character.scenario || '새로운 장면이 시작됩니다.'}</p>
                </div>
                {loading && !messages.length ? <MessageSkeleton /> : null}
                {!loading && !messages.length ? (
                    <Empty className="min-h-80">
                        <EmptyHeader>
                            <EmptyTitle>아직 작성된 장면이 없습니다.</EmptyTitle>
                            <EmptyDescription>
                                {canSelectGreeting
                                    ? '화살표로 카드의 다른 시작 메시지를 선택하세요.'
                                    : '아래 입력창에서 첫 메시지를 보내 대화를 시작하세요.'}
                            </EmptyDescription>
                        </EmptyHeader>
                        {canSelectGreeting ? (
                            <GreetingNavigator
                                currentIndex={greetingIndex}
                                count={greetingCount}
                                onSelect={onSelectGreeting}
                            />
                        ) : null}
                    </Empty>
                ) : null}
                {messages.map((message, index) => {
                    const isEditing = editingMessageId === message.id

                    return (
                        <article
                            key={message.id}
                            data-chat-index={index}
                            data-chat-role={message.role}
                            data-message-id={message.id}
                            className={cn(
                                'risu-chat malang-message-card group mb-5 text-card-foreground transition-colors sm:mb-7',
                                message.role === 'assistant' && 'char',
                                message.role === 'user' && 'user',
                                message.role === 'system' && 'system',
                                message.status === 'streaming' && 'animate-pulse',
                            )}
                        >
                            <div className="malang-message-card__surface min-w-0">
                                {message.role !== 'system' ? (
                                    <header className="malang-message-card__header">
                                        {message.role === 'assistant' ? (
                                            <span className="malang-message-card__avatar">
                                                <CharacterAvatar character={character} />
                                            </span>
                                        ) : (
                                            <span className="malang-message-card__avatar">
                                                <PersonaAvatar
                                                    persona={userPersona}
                                                    fallbackName={userName}
                                                    className="malang-message-card__user-avatar size-full rounded-[inherit]"
                                                />
                                            </span>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <strong>
                                                {message.role === 'assistant'
                                                    ? character.name
                                                    : userName}
                                            </strong>
                                            <small>
                                                {message.role === 'assistant'
                                                    ? 'CHARACTER'
                                                    : 'PLAYER'}
                                            </small>
                                        </div>
                                        <time dateTime={message.createdAt}>
                                            {formatClock(message.createdAt)}
                                            {message.status !== 'complete'
                                                ? ` · ${statusLabel(message.status)}`
                                                : ''}
                                        </time>
                                    </header>
                                ) : (
                                    <div className="malang-message-card__system-label">
                                        <strong>SYSTEM</strong>
                                        <time dateTime={message.createdAt}>
                                            {formatClock(message.createdAt)}
                                        </time>
                                    </div>
                                )}
                                {isEditing ? (
                                    <InlineMessageEditor
                                        message={message}
                                        onCancel={() => changeEditingMessage(null)}
                                        onSave={async (content) => {
                                            await onEdit(message, content)
                                            changeEditingMessage(null)
                                        }}
                                    />
                                ) : (
                                    <div
                                        aria-label={
                                            message.role === 'user'
                                                ? `${userName} 메시지`
                                                : undefined
                                        }
                                        className={cn(
                                            'malang-message-card__content',
                                            message.role === 'system' && 'text-center',
                                            message.status === 'failed' &&
                                                'ring-1 ring-destructive/50',
                                        )}
                                    >
                                        <MessageContent
                                            message={message}
                                            imageAssets={imageAssets}
                                        />
                                    </div>
                                )}
                                {!isEditing &&
                                message.role === 'assistant' &&
                                message.position === 0 ? (
                                    <GreetingNavigator
                                        currentIndex={greetingIndex}
                                        count={greetingCount}
                                        copyContent={message.content}
                                        canNavigate={canSelectGreeting}
                                        onSelect={onSelectGreeting}
                                    />
                                ) : null}
                                {isEditing ||
                                (message.role === 'assistant' && message.position === 0) ? null : (
                                    <MessageTools
                                        message={message}
                                        isLast={index === messages.length - 1}
                                        onRegenerate={onRegenerate}
                                        onStartEdit={() => changeEditingMessage(message.id)}
                                        deleteCount={messages.length - index}
                                        onDelete={onDelete}
                                        onVersions={onVersions}
                                        onSelectVersion={onSelectVersion}
                                    />
                                )}
                            </div>
                        </article>
                    )
                })}
            </div>
        </div>
    )
}

function isNearBottom(viewport: HTMLDivElement): boolean {
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 48
}

function rememberTranscriptScroll(conversationId: string, viewport: HTMLDivElement) {
    transcriptScrollPositions.delete(conversationId)
    transcriptScrollPositions.set(conversationId, {
        top: viewport.scrollTop,
        atBottom: isNearBottom(viewport),
    })
    if (transcriptScrollPositions.size > MAX_SAVED_TRANSCRIPTS) {
        const oldest = transcriptScrollPositions.keys().next().value
        if (oldest) transcriptScrollPositions.delete(oldest)
    }
}

function MessageContent({
    message,
    imageAssets,
}: {
    message: Message
    imageAssets: Array<CharacterAsset | ModuleAsset>
}) {
    const renderedContent = useMemo(() => {
        const source = message.displayContent ?? message.content
        const expanded = expandMessageImages(source, imageAssets, message.id)
        return expanded ? renderMessageHtml(expanded) : ''
    }, [imageAssets, message.content, message.displayContent, message.id])
    const baseClassName = 'chattext text-card-foreground'

    if (renderedContent) {
        return (
            <div
                className={`${baseClassName} regex-display-content whitespace-normal`}
                // Every chat message passes through the PocketRisu-compatible DOMPurify renderer.
                dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
        )
    }
    return (
        <div className={`${baseClassName} whitespace-pre-wrap`}>
            {message.content || <TypingLine />}
        </div>
    )
}

function InlineMessageEditor({
    message,
    onCancel,
    onSave,
}: {
    message: Message
    onCancel: () => void
    onSave: (content: string) => Promise<void>
}) {
    const [value, setValue] = useState(message.content)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const nextContent = value.trim()
    const unchanged = nextContent === message.content.trim()

    useLayoutEffect(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.focus({ preventScroll: true })
        textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }, [])

    async function save() {
        if (!nextContent || unchanged || saving) return
        setSaving(true)
        setError('')
        try {
            await onSave(nextContent)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '메시지를 저장하지 못했습니다.')
            setSaving(false)
        }
    }

    return (
        <div className="malang-inline-editor" aria-busy={saving}>
            <Textarea
                ref={textareaRef}
                value={value}
                rows={10}
                disabled={saving}
                className="min-h-56 max-h-[68dvh] resize-y rounded-lg border-border bg-background/45 px-4 py-4 font-mono text-[0.9rem] leading-7 shadow-inner focus-visible:ring-ring/35"
                aria-label="메시지 원문 편집"
                aria-invalid={error ? true : undefined}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault()
                        onCancel()
                    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        void save()
                    }
                }}
            />
            <footer className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 text-[10px] leading-4 text-muted-foreground">
                    {error ? (
                        <span className="text-destructive" role="alert">
                            {error}
                        </span>
                    ) : (
                        <span>Esc 취소 · ⌘/Ctrl + Enter 저장</span>
                    )}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={onCancel}
                    >
                        <X aria-hidden="true" /> 취소
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        disabled={!nextContent || unchanged || saving}
                        onClick={() => void save()}
                    >
                        <Check aria-hidden="true" /> {saving ? '저장 중' : '저장'}
                    </Button>
                </div>
            </footer>
        </div>
    )
}

function GreetingNavigator({
    currentIndex,
    count,
    copyContent,
    canNavigate = true,
    onSelect,
}: {
    currentIndex: number
    count: number
    copyContent?: string
    canNavigate?: boolean
    onSelect: (greetingIndex: number) => Promise<void>
}) {
    const [switching, setSwitching] = useState(false)
    const position = Math.min(Math.max(currentIndex + 1, 0), count - 1)

    async function move(direction: -1 | 1) {
        if (switching) return
        const nextPosition = (position + direction + count) % count
        setSwitching(true)
        try {
            await onSelect(nextPosition - 1)
        } finally {
            setSwitching(false)
        }
    }

    return (
        <fieldset
            className={cn(
                'malang-message-tools mt-5 flex items-center gap-2 border-x-0 border-b-0 border-t border-border/70 p-0 pt-3 text-muted-foreground',
                copyContent && canNavigate
                    ? 'justify-between'
                    : copyContent
                      ? 'justify-start'
                      : 'justify-end',
            )}
            aria-label="시작 메시지 도구"
            aria-busy={switching}
        >
            {copyContent ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void navigator.clipboard.writeText(copyContent)}
                    aria-label="시작 메시지 복사"
                    title="복사"
                >
                    <Copy aria-hidden="true" />
                </Button>
            ) : null}
            {canNavigate ? (
                <div className="flex items-center gap-0.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={switching}
                        onClick={() => void move(-1)}
                        aria-label="이전 시작 메시지"
                    >
                        <ArrowLeft aria-hidden="true" />
                    </Button>
                    <span
                        className="min-w-12 text-center font-mono text-[10px] tabular-nums"
                        aria-live="polite"
                    >
                        {position + 1} / {count}
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={switching}
                        onClick={() => void move(1)}
                        aria-label="다음 시작 메시지"
                    >
                        <ArrowRight aria-hidden="true" />
                    </Button>
                </div>
            ) : null}
        </fieldset>
    )
}

function MessageTools({
    message,
    isLast,
    onRegenerate,
    onStartEdit,
    deleteCount,
    onDelete,
    onVersions,
    onSelectVersion,
}: {
    message: Message
    isLast: boolean
    onRegenerate: () => void
    onStartEdit: () => void
    deleteCount: number
    onDelete: (message: Message, scope: 'only' | 'from') => Promise<void>
    onVersions: (message: Message) => Promise<{ generations: GenerationRun[] }>
    onSelectVersion: (message: Message, generationId: string) => Promise<void>
}) {
    const [runs, setRuns] = useState<GenerationRun[] | null>(null)
    const [truncating, setTruncating] = useState(false)

    async function versions() {
        if (runs) {
            setRuns(null)
            return
        }
        setRuns((await onVersions(message)).generations)
    }

    return (
        <div className="malang-message-tools mt-5 flex flex-wrap justify-end gap-1 border-t border-border/70 pt-2.5 text-muted-foreground opacity-65 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-[820px]:opacity-100">
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void navigator.clipboard.writeText(message.content)}
                aria-label="메시지 복사"
                title="복사"
            >
                <Copy />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={onStartEdit}
                aria-label="메시지 편집"
                title="편집"
            >
                <PencilSimple />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setTruncating(true)}
                aria-label="메시지 삭제"
                title="삭제"
            >
                <Trash />
            </Button>
            {message.role === 'assistant' ? (
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void versions()}
                    aria-label="생성 기록"
                    title="생성 기록"
                >
                    <ClockCounterClockwise />
                </Button>
            ) : null}
            {message.role === 'assistant' && isLast ? (
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRegenerate}
                    disabled={message.status === 'streaming'}
                    aria-label="메시지 다시 쓰기"
                    title="다시 쓰기"
                >
                    <ArrowClockwise />
                </Button>
            ) : null}
            <MessageDeleteDialog
                open={truncating}
                deleteCount={deleteCount}
                onOpenChange={setTruncating}
                onDelete={(scope) => onDelete(message, scope)}
            />
            {runs ? (
                <div className="mt-3 grid gap-1 border-l border-border pl-3 [&>button]:justify-start [&>button]:text-left">
                    <header>
                        <span>GENERATION ARCHIVE</span>
                        <Button variant="ghost" onClick={() => setRuns(null)}>
                            <X />
                        </Button>
                    </header>
                    {runs.length ? (
                        runs.map((run) => (
                            <Button
                                variant="ghost"
                                key={run.id}
                                className={cn(
                                    (run.processedOutputText || run.outputText) === message.content
                                        ? 'border-selection-border bg-selection-strong text-foreground hover:bg-selection-strong hover:text-foreground'
                                        : '',
                                )}
                                onClick={() => void onSelectVersion(message, run.id)}
                            >
                                <span>
                                    {new Date(run.startedAt).toLocaleString('ko-KR')} ·{' '}
                                    {run.modelId || 'unknown model'}
                                </span>
                                <p>{run.outputText || run.errorMessage || run.status}</p>
                            </Button>
                        ))
                    ) : (
                        <p>이 메시지에 보존된 생성 기록이 없습니다.</p>
                    )}
                </div>
            ) : null}
        </div>
    )
}

function MessageDeleteDialog({
    open,
    deleteCount,
    onOpenChange,
    onDelete,
}: {
    open: boolean
    deleteCount: number
    onOpenChange: (open: boolean) => void
    onDelete: (scope: 'only' | 'from') => Promise<void>
}) {
    const [deleting, setDeleting] = useState(false)

    async function remove(scope: 'only' | 'from') {
        if (deleting) return
        setDeleting(true)
        try {
            await onDelete(scope)
            onOpenChange(false)
        } finally {
            setDeleting(false)
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>이 메시지를 삭제하시겠습니까?</AlertDialogTitle>
                </AlertDialogHeader>
                <div className="grid gap-2">
                    <AlertDialogAction
                        variant="destructive"
                        disabled={deleting}
                        onClick={(event) => {
                            event.preventDefault()
                            void remove('only')
                        }}
                    >
                        이 메시지만 삭제
                    </AlertDialogAction>
                    {deleteCount > 1 ? (
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleting}
                            onClick={(event) => {
                                event.preventDefault()
                                void remove('from')
                            }}
                        >
                            이후 메시지까지 삭제 ({deleteCount}개)
                        </AlertDialogAction>
                    ) : null}
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function MessageSkeleton() {
    return (
        <div
            className="space-y-3 py-8 [&>span]:block [&>span]:h-3 [&>span]:animate-pulse [&>span]:bg-muted"
            aria-label="메시지 불러오는 중"
        >
            <span />
            <span />
            <span />
        </div>
    )
}

function TypingLine() {
    return (
        <span
            className="inline-flex gap-1 [&>i]:size-1.5 [&>i]:animate-bounce [&>i]:rounded-full [&>i]:bg-primary"
            aria-label="답변 작성 중"
        >
            <i />
            <i />
            <i />
        </span>
    )
}

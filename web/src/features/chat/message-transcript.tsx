import {
    type Character,
    type CharacterAsset,
    type GenerationRun,
    illustrationTokenIds,
    type Message,
    type ModuleAsset,
    type Persona,
} from '@malang/shared'
import {
    ArrowClockwise,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    CaretDoubleDown,
    CaretDoubleUp,
    CaretDown,
    CaretUp,
    Check,
    ClockCounterClockwise,
    Copy,
    FastForward,
    PencilSimple,
    Trash,
    X,
} from '@phosphor-icons/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAtomValue } from 'jotai'
import {
    type ReactNode,
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { flushSync } from 'react-dom'

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
import { CharacterAvatar } from '@/features/characters/character-avatar'
import { PersonaAvatar } from '@/features/personas/persona-avatar'
import { api, getClientInstanceId } from '@/lib/api'
import { chatHotkeyAction, isConfirmKey } from '@/lib/chat-shortcuts'
import type { IllustrationView } from '@/lib/message-images'
import { resolveInlayPlaceholders } from '@/lib/pocketrisu/inlays'
import { renderMessageContentHtml } from '@/lib/render-message-content'
import { cn } from '@/lib/utils'

import { formatClock, statusLabel } from './format'
import { illustrationViewsAtom } from './illustration-atom'
import { MessageIllustrationTool } from './message-illustration-tool'

/** The message at the top of the viewport; `null` while reading the latest messages. */
const transcriptScrollAnchors = new Map<string, string | null>()
const MAX_SAVED_TRANSCRIPTS = 50
const TRANSCRIPT_PADDING_END = 32
const END_THRESHOLD = 48
const SCROLL_NAV_VISIBLE_MS = 1500
/** A message whose top is further above the viewport than this counts as the current one. */
const MESSAGE_NAV_TOLERANCE = 30

export function MessageTranscript({
    character,
    conversationId,
    imageAssets,
    userName,
    userPersona,
    messages,
    loading,
    hasOlderMessages,
    loadingOlderMessages,
    onLoadOlder,
    greetingIndex,
    greetingCount,
    onRegenerate,
    onContinue,
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
    hasOlderMessages: boolean
    loadingOlderMessages: boolean
    onLoadOlder: () => Promise<void>
    greetingIndex: number
    greetingCount: number
    onRegenerate: () => void
    onContinue: () => void
    onSelectGreeting: (greetingIndex: number) => Promise<void>
    onEdit: (message: Message, content: string) => Promise<void>
    onDelete: (message: Message, scope: 'only' | 'from') => Promise<void>
    onVersions: (message: Message) => Promise<{ generations: GenerationRun[] }>
    onSelectVersion: (message: Message, generationId: string) => Promise<void>
    onLuaTriggered: () => void | Promise<void>
}) {
    const viewportRef = useRef<HTMLDivElement>(null)
    const headerRef = useRef<HTMLDivElement>(null)
    const restoredConversationRef = useRef<string | null>(null)
    const loadingOlderRef = useRef(false)
    const atEndRef = useRef(true)
    const lastMessageRef = useRef<Message | null>(null)
    const scrollNavTimerRef = useRef<number | undefined>(undefined)
    const [headerHeight, setHeaderHeight] = useState(0)
    const [hasNewMessage, setHasNewMessage] = useState(false)
    const [scrollNavVisible, setScrollNavVisible] = useState(false)
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
    const hasUserMessage = messages.some((message) => message.role === 'user')
    const continuable = canContinue(messages)
    const canSelectGreeting = !hasUserMessage && greetingCount > 1
    // TanStack Virtual intentionally exposes an imperative instance that React Compiler skips.
    // oxlint-disable-next-line react/incompatible-library
    const rowVirtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => viewportRef.current,
        getItemKey: (index) => messages[index]?.id ?? index,
        estimateSize: () => 280,
        overscan: 4,
        measureElement: (element) => element.getBoundingClientRect().height,
        // Chat mode: prepended pages keep the reader's place; the end stays pinned as rows grow.
        anchorTo: 'end',
        followOnAppend: true,
        scrollEndThreshold: END_THRESHOLD,
        paddingStart: headerHeight,
        paddingEnd: TRANSCRIPT_PADDING_END,
    })

    useLayoutEffect(() => {
        const header = headerRef.current
        if (!header) return
        const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight))
        setHeaderHeight(header.offsetHeight)
        observer.observe(header)
        return () => observer.disconnect()
    }, [])

    useLayoutEffect(() => {
        if (restoredConversationRef.current === conversationId || !messages.length) return
        // The previous conversation's messages linger for a render after switching.
        if (messages[0]!.conversationId !== conversationId) return
        restoredConversationRef.current = conversationId
        const anchorId = transcriptScrollAnchors.get(conversationId)
        const anchorIndex = anchorId ? messages.findIndex((message) => message.id === anchorId) : -1
        if (anchorIndex >= 0) rowVirtualizer.scrollToIndex(anchorIndex, { align: 'start' })
        else rowVirtualizer.scrollToEnd()
    }, [conversationId, messages, rowVirtualizer])

    useLayoutEffect(() => {
        const last = messages.at(-1) ?? null
        const previous = lastMessageRef.current
        lastMessageRef.current = last
        if (!last || previous?.conversationId !== last.conversationId) return
        if (last.position <= previous.position) return
        // Sending returns the reader to the end; a reply never pulls a reader who scrolled away.
        if (last.role === 'user') rowVirtualizer.scrollToEnd()
        else if (!atEndRef.current) setHasNewMessage(true)
    }, [messages, rowVirtualizer])

    useEffect(() => () => window.clearTimeout(scrollNavTimerRef.current), [])

    function revealScrollNav() {
        setScrollNavVisible(true)
        window.clearTimeout(scrollNavTimerRef.current)
        scrollNavTimerRef.current = window.setTimeout(
            () => setScrollNavVisible(false),
            SCROLL_NAV_VISIBLE_MS,
        )
    }

    function scrollToTop() {
        rowVirtualizer.scrollToOffset(0, { behavior: 'smooth' })
    }

    function scrollToLatest() {
        setHasNewMessage(false)
        rowVirtualizer.scrollToEnd({ behavior: 'smooth' })
    }

    function scrollToAdjacentMessage(direction: -1 | 1) {
        const viewport = viewportRef.current
        const current = viewport && rowVirtualizer.getVirtualItemForOffset(viewport.scrollTop)
        if (!viewport || !current) return
        const currentIsCutOff = current.start < viewport.scrollTop - MESSAGE_NAV_TOLERANCE
        const index =
            direction === -1 && currentIsCutOff ? current.index : current.index + direction
        if (index < 0 || index >= messages.length) return
        rowVirtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' })
    }

    function startEditing(index: number, messageId: string) {
        flushSync(() => setEditingMessageId(messageId))
        const row = viewportRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
        // The editor is shorter or taller than the text it replaces; keep the editor itself in view.
        if (row) rowVirtualizer.measureElement(row)
        rowVirtualizer.scrollToIndex(index, { align: 'auto' })
    }

    // PocketRisu's chat hotkeys act on the latest message, like its first `.button-icon-*` match.
    const handleChatHotkey = useEffectEvent((event: KeyboardEvent) => {
        const action = chatHotkeyAction(event)
        const index = messages.length - 1
        const last = messages[index]
        if (!action || action === 'send' || !last) return
        event.preventDefault()
        if (action === 'copy') {
            void navigator.clipboard.writeText(last.content)
            return
        }
        // The greeting and a message under edit show no tools, so their hotkeys stay inert too.
        if (editingMessageId || (last.role === 'assistant' && last.position === 0)) return
        if (action === 'edit') {
            startEditing(index, last.id)
        } else if (action === 'delete') {
            rowVirtualizer.scrollToIndex(index, { align: 'auto' })
            setDeletingMessageId(last.id)
        } else if (last.role === 'assistant' && last.status !== 'streaming') {
            onRegenerate()
        }
    })

    useEffect(() => {
        const listener = (event: KeyboardEvent) => handleChatHotkey(event)
        document.addEventListener('keydown', listener)
        return () => document.removeEventListener('keydown', listener)
    }, [])

    function handleScroll() {
        const viewport = viewportRef.current
        if (!viewport) return
        atEndRef.current = rowVirtualizer.isAtEnd(END_THRESHOLD)
        if (atEndRef.current) setHasNewMessage(false)
        const top = atEndRef.current
            ? undefined
            : rowVirtualizer.getVirtualItemForOffset(viewport.scrollTop)
        rememberTranscriptAnchor(conversationId, top ? (messages[top.index]?.id ?? null) : null)
        if (viewport.scrollTop < 240) void loadOlder()
    }

    async function loadOlder() {
        if (!hasOlderMessages || loadingOlderMessages || loadingOlderRef.current) return
        loadingOlderRef.current = true
        try {
            await onLoadOlder()
        } finally {
            loadingOlderRef.current = false
        }
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
        <div className="relative grid min-h-0 grid-rows-[minmax(0,1fr)]">
            <div
                ref={viewportRef}
                id="malang-chat-theme"
                className="malang-transcript min-h-0 overflow-y-auto [overflow-anchor:none]"
                onScroll={handleScroll}
                onWheel={revealScrollNav}
                onTouchMove={revealScrollNav}
            >
                <div
                    className="malang-transcript__inner relative mx-auto"
                    style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                >
                    <div ref={headerRef} className="absolute inset-x-0 top-0 pt-5 sm:pt-8">
                        <div className="malang-scene-marker mb-5 flex items-center gap-4 px-2 font-mono text-[8px] uppercase tracking-widest text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border sm:mb-7">
                            {hasOlderMessages ? (
                                <button
                                    type="button"
                                    className="hover:text-foreground disabled:cursor-wait"
                                    disabled={loadingOlderMessages}
                                    onClick={() => void loadOlder()}
                                >
                                    {loadingOlderMessages ? '불러오는 중…' : '이전 메시지 불러오기'}
                                </button>
                            ) : (
                                <>
                                    <span>SCENE</span>
                                    <p>{character.scenario || '새로운 장면이 시작됩니다.'}</p>
                                </>
                            )}
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
                    </div>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const index = virtualRow.index
                        const message = messages[index]!
                        const isEditing = editingMessageId === message.id

                        return (
                            <article
                                key={message.id}
                                ref={rowVirtualizer.measureElement}
                                data-index={virtualRow.index}
                                data-chat-index={message.position}
                                data-chat-role={message.role}
                                data-message-id={message.id}
                                className={cn(
                                    'risu-chat malang-message-card group absolute left-0 top-0 w-full pb-5 text-card-foreground transition-colors sm:pb-7',
                                    message.role === 'assistant' && 'char',
                                    message.role === 'user' && 'user',
                                    message.role === 'system' && 'system',
                                    message.status === 'streaming' && 'animate-pulse',
                                )}
                                style={{ transform: `translateY(${virtualRow.start}px)` }}
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
                                            onCancel={() => setEditingMessageId(null)}
                                            onSave={async (content) => {
                                                await onEdit(message, content)
                                                setEditingMessageId(null)
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
                                    (message.role === 'assistant' &&
                                        message.position === 0) ? null : (
                                        <MessageTools
                                            conversationId={conversationId}
                                            message={message}
                                            isLast={index === messages.length - 1}
                                            onRegenerate={onRegenerate}
                                            canContinue={continuable}
                                            onContinue={onContinue}
                                            onStartEdit={() => startEditing(index, message.id)}
                                            deleteCount={messages.length - index}
                                            deleting={deletingMessageId === message.id}
                                            onDeletingChange={(open) =>
                                                setDeletingMessageId(open ? message.id : null)
                                            }
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
            {messages.length ? (
                <div
                    className={cn(
                        'absolute right-3 bottom-4 z-20 flex flex-col overflow-hidden rounded-lg border border-border/60 bg-background/80 shadow-lg backdrop-blur-sm transition-opacity duration-300',
                        !scrollNavVisible && 'pointer-events-none opacity-0',
                    )}
                    onPointerEnter={revealScrollNav}
                    onPointerMove={revealScrollNav}
                >
                    <ScrollNavButton label="맨 위로" onClick={scrollToTop}>
                        <CaretDoubleUp />
                    </ScrollNavButton>
                    <ScrollNavButton
                        label="이전 메시지"
                        onClick={() => scrollToAdjacentMessage(-1)}
                    >
                        <CaretUp />
                    </ScrollNavButton>
                    <ScrollNavButton label="다음 메시지" onClick={() => scrollToAdjacentMessage(1)}>
                        <CaretDown />
                    </ScrollNavButton>
                    <ScrollNavButton label="맨 아래로" onClick={scrollToLatest}>
                        <CaretDoubleDown />
                    </ScrollNavButton>
                </div>
            ) : null}
            {hasNewMessage ? (
                <Button
                    size="sm"
                    className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full shadow-lg"
                    onClick={scrollToLatest}
                >
                    <ArrowDown />새 메시지
                </Button>
            ) : null}
        </div>
    )
}

function ScrollNavButton({
    label,
    onClick,
    children,
}: {
    label: string
    onClick: () => void
    children: ReactNode
}) {
    return (
        <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-none text-muted-foreground not-last:border-b not-last:border-border/60 hover:text-foreground"
            aria-label={label}
            title={label}
            onClick={onClick}
        >
            {children}
        </Button>
    )
}

function rememberTranscriptAnchor(conversationId: string, anchorMessageId: string | null) {
    transcriptScrollAnchors.delete(conversationId)
    transcriptScrollAnchors.set(conversationId, anchorMessageId)
    if (transcriptScrollAnchors.size > MAX_SAVED_TRANSCRIPTS) {
        const oldest = transcriptScrollAnchors.keys().next().value
        if (oldest) transcriptScrollAnchors.delete(oldest)
    }
}

/** This message's illustrations; other messages' updates keep the same map. */
function useMessageIllustrations(source: string): ReadonlyMap<string, IllustrationView> {
    const all = useAtomValue(illustrationViewsAtom)
    const entries = illustrationTokenIds(source).flatMap((id) => {
        const view = all.get(id)
        return view ? [[id, view] as const] : []
    })
    const key = JSON.stringify(entries)
    return useMemo(() => new Map<string, IllustrationView>(JSON.parse(key)), [key])
}

function MessageContent({
    message,
    imageAssets,
}: {
    message: Message
    imageAssets: Array<CharacterAsset | ModuleAsset>
}) {
    const source = message.displayContent ?? message.content
    const illustrations = useMessageIllustrations(source)
    const renderedContent = useMemo(
        () => renderMessageContentHtml(source, imageAssets, message.id, illustrations),
        [illustrations, imageAssets, message.id, source],
    )
    const contentRef = useRef<HTMLDivElement>(null)
    useLayoutEffect(() => {
        if (contentRef.current) resolveInlayPlaceholders(contentRef.current, imageAssets)
    }, [imageAssets, renderedContent])
    const baseClassName = 'chattext text-card-foreground'

    // An empty stored message is still streaming. Text that renders to nothing (a regex
    // that hides it, or only stripped markup) stays empty, as it does in PocketRisu.
    if (!message.content && !message.displayContent) {
        return (
            <div className={`${baseClassName} whitespace-pre-wrap`}>
                <TypingLine />
            </div>
        )
    }
    return (
        <div
            ref={contentRef}
            className={`${baseClassName} regex-display-content whitespace-normal`}
            // Every chat message passes through the PocketRisu-ported markdown renderer.
            dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
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

    // Grows with the text like the message it replaces; `field-sizing` alone is missing on older Safari.
    useLayoutEffect(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.style.height = 'auto'
        const border = textarea.offsetHeight - textarea.clientHeight
        textarea.style.height = `${textarea.scrollHeight + border}px`
    }, [value])

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
                disabled={saving}
                className="resize-none overflow-hidden rounded-lg border-border bg-background/45 px-4 py-4 font-mono text-[0.9rem] leading-7 shadow-inner focus-visible:ring-ring/35"
                aria-label="메시지 원문 편집"
                aria-invalid={error ? true : undefined}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault()
                        onCancel()
                    } else if (isConfirmKey(event)) {
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

/** The server's continue guard: two chat turns past the greeting, ending on the character. */
function canContinue(messages: Message[]): boolean {
    const stored = messages.filter((message) => message.status !== 'failed')
    const chat = stored[0]?.role === 'assistant' ? stored.slice(1) : stored
    const last = chat.at(-1)
    return chat.length >= 2 && last?.role === 'assistant' && last === messages.at(-1)
}

function MessageTools({
    conversationId,
    message,
    isLast,
    onRegenerate,
    canContinue,
    onContinue,
    onStartEdit,
    deleteCount,
    deleting,
    onDeletingChange,
    onDelete,
    onVersions,
    onSelectVersion,
}: {
    conversationId: string
    message: Message
    isLast: boolean
    onRegenerate: () => void
    canContinue: boolean
    onContinue: () => void
    onStartEdit: () => void
    deleteCount: number
    deleting: boolean
    onDeletingChange: (open: boolean) => void
    onDelete: (message: Message, scope: 'only' | 'from') => Promise<void>
    onVersions: (message: Message) => Promise<{ generations: GenerationRun[] }>
    onSelectVersion: (message: Message, generationId: string) => Promise<void>
}) {
    const [runs, setRuns] = useState<GenerationRun[] | null>(null)

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
                onClick={() => onDeletingChange(true)}
                aria-label="메시지 삭제"
                title="삭제"
            >
                <Trash />
            </Button>
            {message.role === 'assistant' ? (
                <MessageIllustrationTool conversationId={conversationId} message={message} />
            ) : null}
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
            {message.role === 'assistant' && isLast ? (
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onContinue}
                    disabled={!canContinue || message.status === 'streaming'}
                    aria-label="응답 계속하기"
                    title="응답 계속하기"
                >
                    <FastForward />
                </Button>
            ) : null}
            <MessageDeleteDialog
                open={deleting}
                deleteCount={deleteCount}
                onOpenChange={onDeletingChange}
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

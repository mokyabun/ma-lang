import type {
    Conversation,
    ConversationModuleState,
    GenerationEvent,
    GenerationRequest,
    Message,
} from '@malang/shared'
import { atom } from 'jotai'

import { api, getClientInstanceId, streamGeneration } from '@/lib/api'

import {
    conversationsAtom,
    selectedCharacterIdAtom,
    selectedConversationIdAtom,
    workspaceErrorAtom,
} from '../atom'
import { mobileSidebarOpenAtom } from '../sidebar/atom'

export interface ActiveGeneration {
    generationId?: string
}

export const messagesAtom = atom<Message[]>([])
export const hasOlderMessagesAtom = atom(false)
export const olderMessagesLoadingAtom = atom(false)
const nextMessageCursorAtom = atom<number | null>(null)
const loadedMessagesConversationIdAtom = atom<string | null>(null)
export const conversationModuleStatesAtom = atom<ConversationModuleState[]>([])
export const activeGenerationsAtom = atom<Record<string, ActiveGeneration>>({})
export const messageLoadingAtom = atom(false)
export const inspectorOpenAtom = atom(false)
export const conversationCreatingAtom = atom(false)

export const hasStreamingMessageAtom = atom((get) =>
    get(messagesAtom).some((message) => message.status === 'streaming'),
)

export const generatingConversationIdsAtom = atom(
    (get) => new Set(Object.keys(get(activeGenerationsAtom))),
)

const MESSAGE_PAGE_SIZE = 50

export const loadConversationAtom = atom(
    null,
    async (get, set, request: string | { conversationId: string; resetMessages?: boolean }) => {
        const conversationId = typeof request === 'string' ? request : request.conversationId
        const resetMessages = typeof request === 'string' ? false : request.resetMessages === true
        const isFirstPage =
            resetMessages || get(loadedMessagesConversationIdAtom) !== conversationId
        if (isFirstPage && get(selectedConversationIdAtom) === conversationId) {
            set(messagesAtom, [])
            set(hasOlderMessagesAtom, false)
            set(nextMessageCursorAtom, null)
            set(loadedMessagesConversationIdAtom, conversationId)
        }
        set(messageLoadingAtom, true)
        try {
            const [messageResult, activeResult, moduleResult] = await Promise.all([
                api.messages(conversationId, { limit: MESSAGE_PAGE_SIZE }),
                api.activeGeneration(conversationId),
                api.conversationModules(conversationId),
            ])
            if (get(selectedConversationIdAtom) === conversationId) {
                if (isFirstPage) {
                    set(messagesAtom, messageResult.messages)
                    set(hasOlderMessagesAtom, messageResult.hasMore)
                    set(nextMessageCursorAtom, messageResult.nextCursor)
                } else {
                    set(messagesAtom, (current) => {
                        const firstLatestPosition = messageResult.messages[0]?.position
                        const older =
                            firstLatestPosition === undefined
                                ? []
                                : current.filter(
                                      (message) => message.position < firstLatestPosition,
                                  )
                        return [...older, ...messageResult.messages]
                    })
                }
                set(conversationModuleStatesAtom, moduleResult.modules)
            }
            set(activeGenerationsAtom, (current) => {
                const next = { ...current }
                if (activeResult.generation) {
                    next[conversationId] = { generationId: activeResult.generation.id }
                } else {
                    delete next[conversationId]
                }
                return next
            })
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '메시지를 불러오지 못했습니다.',
            )
        } finally {
            set(messageLoadingAtom, false)
        }
    },
)

export const loadOlderMessagesAtom = atom(null, async (get, set, conversationId: string) => {
    if (
        get(olderMessagesLoadingAtom) ||
        !get(hasOlderMessagesAtom) ||
        get(loadedMessagesConversationIdAtom) !== conversationId
    ) {
        return
    }
    const before = get(nextMessageCursorAtom)
    if (before === null) return
    set(olderMessagesLoadingAtom, true)
    try {
        const page = await api.messages(conversationId, { before, limit: MESSAGE_PAGE_SIZE })
        if (
            get(selectedConversationIdAtom) !== conversationId ||
            get(loadedMessagesConversationIdAtom) !== conversationId
        ) {
            return
        }
        set(messagesAtom, (current) => {
            const currentIds = new Set(current.map((message) => message.id))
            return [...page.messages.filter((message) => !currentIds.has(message.id)), ...current]
        })
        set(hasOlderMessagesAtom, page.hasMore)
        set(nextMessageCursorAtom, page.nextCursor)
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '이전 메시지를 불러오지 못했습니다.',
        )
    } finally {
        set(olderMessagesLoadingAtom, false)
    }
})

export const createConversationAtom = atom(
    null,
    async (
        get,
        set,
        input: {
            characterId?: string
            title?: string
            promptPresetId?: string
            greetingIndex?: number
        } = {},
    ) => {
        if (get(conversationCreatingAtom)) return null
        const { characterId: requestedCharacterId, ...conversationInput } = input
        const characterId = requestedCharacterId ?? get(selectedCharacterIdAtom)
        if (!characterId) return null
        set(conversationCreatingAtom, true)
        set(workspaceErrorAtom, '')
        try {
            const conversation = await api.createConversation(characterId, conversationInput)
            set(conversationsAtom, (current) => [conversation, ...current])
            set(selectedCharacterIdAtom, characterId)
            set(selectedConversationIdAtom, conversation.id)
            set(mobileSidebarOpenAtom, false)
            return conversation
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '대화를 만들지 못했습니다.',
            )
            return null
        } finally {
            set(conversationCreatingAtom, false)
        }
    },
)

export const updateConversationAtom = atom(
    null,
    async (
        _get,
        set,
        {
            conversationId,
            input,
        }: {
            conversationId: string
            input: Partial<
                Pick<
                    Conversation,
                    | 'title'
                    | 'authorNote'
                    | 'variables'
                    | 'promptPresetId'
                    | 'promptPresetLocked'
                    | 'boundPersonaId'
                    | 'personaLocked'
                    | 'greetingIndex'
                    | 'modelPresetId'
                    | 'auxiliaryModelPresetId'
                    | 'modelChainPresetId'
                >
            >
        },
    ) => {
        try {
            const conversation = await api.updateConversation(conversationId, input)
            set(conversationsAtom, (current) =>
                current.map((item) => (item.id === conversation.id ? conversation : item)),
            )
            return conversation
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '대화 설정을 저장하지 못했습니다.',
            )
            return null
        }
    },
)

export const toggleConversationModuleAtom = atom(
    null,
    async (
        _get,
        set,
        {
            conversationId,
            moduleId,
            enabled,
        }: { conversationId: string; moduleId: string; enabled: boolean | null },
    ) => {
        try {
            const result = await api.updateConversationModule(conversationId, moduleId, enabled)
            set(conversationModuleStatesAtom, result.modules)
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '모듈 설정을 저장하지 못했습니다.',
            )
        }
    },
)

export const archiveConversationAtom = atom(null, async (get, set, conversationId: string) => {
    try {
        await api.archiveConversation(conversationId)
        const next = get(conversationsAtom).filter((item) => item.id !== conversationId)
        const nextConversation =
            next.find((item) => item.characterId === get(selectedCharacterIdAtom)) ?? null
        set(conversationsAtom, next)
        set(selectedConversationIdAtom, nextConversation?.id ?? null)
        set(inspectorOpenAtom, false)
        return { ok: true as const, nextConversation }
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '대화를 보관하지 못했습니다.',
        )
        return { ok: false as const, nextConversation: null }
    }
})

export const deleteConversationAtom = atom(null, async (get, set, conversationId: string) => {
    try {
        await api.deleteConversation(conversationId)
        const conversations = get(conversationsAtom).filter((item) => item.id !== conversationId)
        const nextConversation =
            conversations.find(
                (item) => !item.archivedAt && item.characterId === get(selectedCharacterIdAtom),
            ) ?? null
        set(conversationsAtom, conversations)
        if (get(selectedConversationIdAtom) === conversationId) {
            set(selectedConversationIdAtom, nextConversation?.id ?? null)
            set(messagesAtom, [])
            set(hasOlderMessagesAtom, false)
            set(nextMessageCursorAtom, null)
            set(loadedMessagesConversationIdAtom, null)
            set(conversationModuleStatesAtom, [])
        }
        set(activeGenerationsAtom, (current) => {
            const next = { ...current }
            delete next[conversationId]
            return next
        })
        set(inspectorOpenAtom, false)
        return { ok: true as const, nextConversation }
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '대화를 삭제하지 못했습니다.',
        )
        return { ok: false as const, nextConversation: null }
    }
})

export const generateReplyAtom = atom(
    null,
    async (
        get,
        set,
        {
            conversationId,
            content,
            mode = 'reply',
        }: {
            conversationId: string
            content?: string
            mode?: GenerationRequest['mode']
        },
    ) => {
        if (get(activeGenerationsAtom)[conversationId]) return
        set(workspaceErrorAtom, '')
        set(activeGenerationsAtom, (current) => ({ ...current, [conversationId]: {} }))

        if (content && get(selectedConversationIdAtom) === conversationId) {
            const now = new Date().toISOString()
            set(messagesAtom, (current) => [
                ...current,
                {
                    id: `pending-${crypto.randomUUID()}`,
                    conversationId,
                    role: 'user',
                    content,
                    position: (current.at(-1)?.position ?? -1) + 1,
                    status: 'complete',
                    createdAt: now,
                    updatedAt: now,
                },
            ])
        }

        const applyEvent = (event: GenerationEvent) => {
            if (event.type === 'generation.started') {
                set(activeGenerationsAtom, (current) => ({
                    ...current,
                    [conversationId]: { generationId: event.generationId },
                }))
                void set(loadConversationAtom, conversationId)
                return
            }
            if (get(selectedConversationIdAtom) !== conversationId) return

            if (event.type === 'message.delta' || event.type === 'message.snapshot') {
                set(messagesAtom, (current) => {
                    const existing = current.find((message) => message.id === event.messageId)
                    const contentValue =
                        event.type === 'message.delta'
                            ? (existing?.content ?? '') + event.delta
                            : event.content
                    if (existing) {
                        return current.map((message) =>
                            message.id === event.messageId
                                ? { ...message, content: contentValue }
                                : message,
                        )
                    }
                    const now = new Date().toISOString()
                    return [
                        ...current,
                        {
                            id: event.messageId,
                            conversationId,
                            role: 'assistant',
                            content: contentValue,
                            position: (current.at(-1)?.position ?? -1) + 1,
                            status: 'streaming',
                            createdAt: now,
                            updatedAt: now,
                        },
                    ]
                })
                return
            }
            if (event.type === 'message.completed') {
                set(messagesAtom, (current) => {
                    const withoutReplacedStream = current.filter(
                        (message) =>
                            message.id === event.message.id || message.status !== 'streaming',
                    )
                    return withoutReplacedStream.some((message) => message.id === event.message.id)
                        ? withoutReplacedStream.map((message) =>
                              message.id === event.message.id ? event.message : message,
                          )
                        : [...withoutReplacedStream, event.message]
                })
                return
            }
            set(workspaceErrorAtom, event.error.message)
        }

        try {
            const request = {
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: getClientInstanceId(),
            }
            await streamGeneration(
                conversationId,
                mode === 'reply'
                    ? { mode, content: content ?? '', ...request }
                    : { mode, ...request },
                applyEvent,
            )
            const result = await api.conversations()
            set(conversationsAtom, result.conversations)
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '답변을 생성하지 못했습니다.',
            )
            await set(loadConversationAtom, conversationId)
        } finally {
            set(activeGenerationsAtom, (current) => {
                const next = { ...current }
                delete next[conversationId]
                return next
            })
        }
    },
)

export const cancelGenerationAtom = atom(null, async (get, set, conversationId: string) => {
    const generationId = get(activeGenerationsAtom)[conversationId]?.generationId
    if (!generationId) return
    try {
        await api.cancelGeneration(generationId)
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '생성을 중단하지 못했습니다.',
        )
    }
})

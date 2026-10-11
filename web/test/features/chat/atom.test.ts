import { describe, expect, spyOn, test } from 'bun:test'

import type { GenerationEvent, Message } from '@malang/shared'
import { mockFetch, sse } from '@test/helpers/fetch'
import { makeConversation, makeGenerationRun, makeMessage, testId } from '@test/helpers/fixtures'
import { createStore } from 'jotai'

import {
    activeGenerationsAtom,
    archiveConversationAtom,
    cancelGenerationAtom,
    conversationCreatingAtom,
    conversationModuleStatesAtom,
    createConversationAtom,
    deleteConversationAtom,
    generateReplyAtom,
    hasOlderMessagesAtom,
    inspectorOpenAtom,
    loadConversationAtom,
    loadOlderMessagesAtom,
    messageLoadingAtom,
    messagesAtom,
    refreshMessagesAtom,
    toggleConversationModuleAtom,
    updateConversationAtom,
} from '@/features/chat/atom'
import { api, type MessagePage } from '@/lib/api'
import {
    conversationsAtom,
    mobileSidebarOpenAtom,
    selectedCharacterIdAtom,
    selectedConversationIdAtom,
    workspaceErrorAtom,
} from '@/lib/store'

const characterId = testId(10)
const conversationId = testId(100)
const otherConversationId = testId(101)

function page(messages: Message[], hasMore = false, nextCursor: number | null = null): MessagePage {
    return { messages, hasMore, nextCursor }
}

function messageAt(position: number, overrides: Partial<Message> = {}) {
    return makeMessage({ id: testId(200 + position), conversationId, position, ...overrides })
}

function stubConversationReads(...pages: MessagePage[]) {
    const messages = spyOn(api, 'messages')
    for (const next of pages) messages.mockResolvedValueOnce(next)
    spyOn(api, 'activeGeneration').mockResolvedValue({ generation: null })
    spyOn(api, 'conversationModules').mockResolvedValue({ modules: [] })
    return messages
}

function selectedStore(selected = conversationId) {
    const store = createStore()
    store.set(selectedCharacterIdAtom, characterId)
    store.set(selectedConversationIdAtom, selected)
    return store
}

describe('loading a conversation', () => {
    test('shows the newest page and the running generation', async () => {
        const store = selectedStore()
        const messages = stubConversationReads(page([messageAt(4), messageAt(5)], true, 4))
        spyOn(api, 'activeGeneration').mockResolvedValue({ generation: makeGenerationRun() })

        await store.set(loadConversationAtom, conversationId)

        expect(messages).toHaveBeenCalledWith(conversationId, { limit: 50 })
        expect(store.get(messagesAtom).map((message) => message.position)).toEqual([4, 5])
        expect(store.get(hasOlderMessagesAtom)).toBe(true)
        expect(store.get(activeGenerationsAtom)).toEqual({
            [conversationId]: { generationId: makeGenerationRun().id },
        })
        expect(store.get(messageLoadingAtom)).toBe(false)
    })

    test('drops a page that arrives after another conversation was selected', async () => {
        const store = selectedStore()
        const late = Promise.withResolvers<MessagePage>()
        stubConversationReads()
        spyOn(api, 'messages').mockReturnValueOnce(late.promise)

        const loading = store.set(loadConversationAtom, conversationId)
        store.set(selectedConversationIdAtom, otherConversationId)
        late.resolve(page([messageAt(0)]))
        await loading

        expect(store.get(messagesAtom)).toEqual([])
    })

    test('reports a failed load', async () => {
        const store = selectedStore()
        stubConversationReads()
        spyOn(api, 'messages').mockRejectedValue(new Error('offline'))

        await store.set(loadConversationAtom, conversationId)

        expect(store.get(workspaceErrorAtom)).toBe('offline')
        expect(store.get(messageLoadingAtom)).toBe(false)
    })
})

describe('message paging', () => {
    test('refreshes as many messages as are loaded, paging backwards', async () => {
        const store = selectedStore()
        const newest = Array.from({ length: 30 }, (_, index) => messageAt(20 + index))
        const older = Array.from({ length: 20 }, (_, index) => messageAt(index))
        const messages = stubConversationReads(page(newest, true, 20), page(newest, true, 20))
        messages.mockResolvedValueOnce(page(older, true, 0))
        await store.set(loadConversationAtom, conversationId)

        await store.set(refreshMessagesAtom, conversationId)

        expect(messages.mock.calls.slice(1)).toEqual([
            [conversationId, { before: undefined, limit: 50 }],
            [conversationId, { before: 20, limit: 20 }],
        ])
        expect(store.get(messagesAtom).map((message) => message.position)).toEqual([
            ...older.map((message) => message.position),
            ...newest.map((message) => message.position),
        ])
        expect(store.get(hasOlderMessagesAtom)).toBe(true)
    })

    test('does not refresh a conversation that is not loaded', async () => {
        const store = selectedStore()
        const messages = stubConversationReads()
        await store.set(refreshMessagesAtom, conversationId)
        expect(messages).not.toHaveBeenCalled()
    })

    test('prepends older messages once and stops at the first page', async () => {
        const store = selectedStore()
        const messages = stubConversationReads(
            page([messageAt(10), messageAt(11)], true, 10),
            page([messageAt(8), messageAt(9), messageAt(10)], false, null),
        )
        await store.set(loadConversationAtom, conversationId)

        await store.set(loadOlderMessagesAtom, conversationId)
        await store.set(loadOlderMessagesAtom, conversationId)

        expect(messages).toHaveBeenCalledTimes(2)
        expect(messages).toHaveBeenLastCalledWith(conversationId, { before: 10, limit: 50 })
        expect(store.get(messagesAtom).map((message) => message.position)).toEqual([8, 9, 10, 11])
        expect(store.get(hasOlderMessagesAtom)).toBe(false)
    })
})

describe('conversation commands', () => {
    test('creates a conversation for the selected character and opens it', async () => {
        const store = createStore()
        store.set(selectedCharacterIdAtom, characterId)
        store.set(mobileSidebarOpenAtom, true)
        store.set(conversationsAtom, [makeConversation({ id: otherConversationId })])
        const created = makeConversation({ id: conversationId, title: 'New' })
        const create = spyOn(api, 'createConversation').mockResolvedValue(created)

        expect(await store.set(createConversationAtom, { title: 'New' })).toBe(created)

        expect(create).toHaveBeenCalledWith(characterId, { title: 'New' })
        expect(store.get(conversationsAtom).map((item) => item.id)).toEqual([
            conversationId,
            otherConversationId,
        ])
        expect(store.get(selectedConversationIdAtom)).toBe(conversationId)
        expect(store.get(mobileSidebarOpenAtom)).toBe(false)
        expect(store.get(conversationCreatingAtom)).toBe(false)
    })

    test('creates nothing without a character or while another creation runs', async () => {
        const store = createStore()
        const pending = Promise.withResolvers<ReturnType<typeof makeConversation>>()
        const create = spyOn(api, 'createConversation').mockReturnValue(pending.promise)

        expect(await store.set(createConversationAtom)).toBeNull()
        const first = store.set(createConversationAtom, { characterId })
        expect(await store.set(createConversationAtom, { characterId })).toBeNull()
        pending.resolve(makeConversation())
        await first

        expect(create).toHaveBeenCalledTimes(1)
    })

    test('reports a failed creation', async () => {
        const store = createStore()
        spyOn(api, 'createConversation').mockRejectedValue(new Error('no preset'))
        expect(await store.set(createConversationAtom, { characterId })).toBeNull()
        expect(store.get(workspaceErrorAtom)).toBe('no preset')
        expect(store.get(conversationCreatingAtom)).toBe(false)
    })

    test('replaces an updated conversation and reports a failed update', async () => {
        const store = createStore()
        store.set(conversationsAtom, [
            makeConversation({ id: conversationId }),
            makeConversation({ id: otherConversationId }),
        ])
        const renamed = makeConversation({ id: conversationId, title: 'Renamed' })
        spyOn(api, 'updateConversation').mockResolvedValueOnce(renamed)

        const input = { conversationId, input: { title: 'Renamed' } }
        expect(await store.set(updateConversationAtom, input)).toBe(renamed)
        expect(store.get(conversationsAtom)[0]).toBe(renamed)

        spyOn(api, 'updateConversation').mockRejectedValueOnce(new Error('conflict'))
        expect(await store.set(updateConversationAtom, input)).toBeNull()
        expect(store.get(workspaceErrorAtom)).toBe('conflict')
    })

    test('saves a module override and reports a failed one', async () => {
        const store = createStore()
        const update = spyOn(api, 'updateConversationModule').mockResolvedValueOnce({
            modules: [],
        })
        const input = { conversationId, moduleId: testId(950), enabled: null }

        await store.set(toggleConversationModuleAtom, input)
        expect(update).toHaveBeenCalledWith(conversationId, testId(950), null)

        update.mockRejectedValueOnce(new Error('missing module'))
        await store.set(toggleConversationModuleAtom, input)
        expect(store.get(workspaceErrorAtom)).toBe('missing module')
    })

    test('archives a conversation and opens the character’s next one', async () => {
        const store = selectedStore()
        store.set(inspectorOpenAtom, true)
        const next = makeConversation({ id: otherConversationId })
        store.set(conversationsAtom, [
            makeConversation({ id: conversationId }),
            makeConversation({ id: testId(102), characterId: testId(11) }),
            next,
        ])
        spyOn(api, 'archiveConversation').mockResolvedValue(undefined)

        expect(await store.set(archiveConversationAtom, conversationId)).toEqual({
            ok: true,
            nextConversation: next,
        })
        expect(store.get(conversationsAtom).map((item) => item.id)).toEqual([
            testId(102),
            otherConversationId,
        ])
        expect(store.get(selectedConversationIdAtom)).toBe(otherConversationId)
        expect(store.get(inspectorOpenAtom)).toBe(false)
    })

    test('deletes the open conversation and clears what it showed', async () => {
        const store = selectedStore()
        stubConversationReads(page([messageAt(0)], true, 0))
        await store.set(loadConversationAtom, conversationId)
        store.set(activeGenerationsAtom, { [conversationId]: { generationId: testId(500) } })
        const next = makeConversation({ id: otherConversationId })
        store.set(conversationsAtom, [
            makeConversation({ id: conversationId }),
            makeConversation({ id: testId(102), archivedAt: '2026-01-02T00:00:00.000Z' }),
            next,
        ])
        spyOn(api, 'deleteConversation').mockResolvedValue(undefined)

        const result = await store.set(deleteConversationAtom, conversationId)

        expect(result).toEqual({ ok: true, nextConversation: next })
        expect(store.get(selectedConversationIdAtom)).toBe(otherConversationId)
        expect(store.get(messagesAtom)).toEqual([])
        expect(store.get(hasOlderMessagesAtom)).toBe(false)
        expect(store.get(conversationModuleStatesAtom)).toEqual([])
        expect(store.get(activeGenerationsAtom)).toEqual({})
    })

    test('keeps the open transcript when another conversation is deleted', async () => {
        const store = selectedStore()
        stubConversationReads(page([messageAt(0)]))
        await store.set(loadConversationAtom, conversationId)
        store.set(conversationsAtom, [
            makeConversation({ id: conversationId }),
            makeConversation({ id: otherConversationId }),
        ])
        spyOn(api, 'deleteConversation').mockResolvedValue(undefined)

        await store.set(deleteConversationAtom, otherConversationId)

        expect(store.get(selectedConversationIdAtom)).toBe(conversationId)
        expect(store.get(messagesAtom)).toHaveLength(1)
    })

    test('reports a failed delete and keeps the conversation', async () => {
        const store = selectedStore()
        store.set(conversationsAtom, [makeConversation({ id: conversationId })])
        spyOn(api, 'deleteConversation').mockRejectedValue(new Error('locked'))

        expect(await store.set(deleteConversationAtom, conversationId)).toEqual({
            ok: false,
            nextConversation: null,
        })
        expect(store.get(conversationsAtom)).toHaveLength(1)
        expect(store.get(workspaceErrorAtom)).toBe('locked')
    })
})

describe('generating a reply', () => {
    const generationId = testId(500)
    const replyId = testId(250)

    function streamEvents(...events: GenerationEvent[]) {
        return mockFetch(() => sse(...events))
    }

    test('shows the user message at once and streams the reply into the transcript', async () => {
        const store = selectedStore()
        const messages = stubConversationReads(page([messageAt(0)]))
        await store.set(loadConversationAtom, conversationId)
        const reload = Promise.withResolvers<MessagePage>()
        messages.mockReturnValueOnce(reload.promise)
        const finalReply = messageAt(2, { id: replyId, role: 'assistant', content: 'Hello!' })
        streamEvents(
            { type: 'generation.started', generationId, messageId: replyId },
            { type: 'message.delta', generationId, messageId: replyId, delta: 'Hel' },
            { type: 'message.delta', generationId, messageId: replyId, delta: 'lo' },
            { type: 'message.completed', generationId, message: finalReply },
        )
        const refreshed = makeConversation({ id: conversationId, title: 'After reply' })
        spyOn(api, 'conversations').mockResolvedValue({ conversations: [refreshed], groups: [] })
        const replies: string[] = []
        store.sub(messagesAtom, () => {
            const reply = store.get(messagesAtom).find((message) => message.id === replyId)
            if (reply && reply.content !== replies.at(-1)) replies.push(reply.content)
        })

        await store.set(generateReplyAtom, { conversationId, content: 'Hi' })

        expect(replies).toEqual(['Hel', 'Hello', 'Hello!'])
        const [first, user, reply] = store.get(messagesAtom)
        expect(first!.position).toBe(0)
        expect(user).toMatchObject({ role: 'user', content: 'Hi', position: 1 })
        expect(user!.id).toStartWith('pending-')
        expect(reply).toEqual(finalReply)
        expect(store.get(activeGenerationsAtom)).toEqual({})
        expect(store.get(conversationsAtom)).toEqual([refreshed])

        const serverUser = messageAt(1, { id: testId(240), content: 'Hi' })
        reload.resolve(page([serverUser, finalReply]))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(store.get(messagesAtom).map((message) => message.id)).toEqual([
            messageAt(0).id,
            serverUser.id,
            replyId,
        ])
    })

    test('sends the request mode and marks the conversation as generating', async () => {
        const store = selectedStore()
        const { calls } = streamEvents()
        spyOn(api, 'conversations').mockResolvedValue({ conversations: [], groups: [] })

        const running = store.set(generateReplyAtom, { conversationId, mode: 'regenerate' })
        expect(store.get(activeGenerationsAtom)).toEqual({ [conversationId]: {} })
        expect(await store.set(generateReplyAtom, { conversationId, content: 'again' })).toBe(
            undefined,
        )
        await running

        expect(calls).toHaveLength(1)
        expect(JSON.parse(calls[0]!.body as string)).toMatchObject({ mode: 'regenerate' })
        expect(JSON.parse(calls[0]!.body as string)).not.toHaveProperty('content')
    })

    test('shows a generation failure reported by the stream', async () => {
        const store = selectedStore()
        streamEvents({
            type: 'generation.failed',
            generationId,
            error: { code: 'rate_limited', message: 'Rate limited', requestId: 'req' },
        })
        spyOn(api, 'conversations').mockResolvedValue({ conversations: [], groups: [] })

        await store.set(generateReplyAtom, { conversationId, content: 'Hi' })

        expect(store.get(workspaceErrorAtom)).toBe('Rate limited')
    })

    test('reports a rejected request and reloads the transcript', async () => {
        const store = selectedStore()
        const messages = stubConversationReads(page([messageAt(0)]))
        mockFetch(() =>
            Response.json({ code: 'conflict', message: 'Already generating' }, { status: 409 }),
        )

        await store.set(generateReplyAtom, { conversationId, content: 'Hi' })

        expect(store.get(workspaceErrorAtom)).toBe('Already generating')
        expect(messages).toHaveBeenCalledTimes(1)
        expect(store.get(messagesAtom)).toEqual([messageAt(0)])
        expect(store.get(activeGenerationsAtom)).toEqual({})
    })

    test('cancels the running generation and reports a failed cancel', async () => {
        const store = createStore()
        const cancel = spyOn(api, 'cancelGeneration').mockResolvedValue(undefined)

        store.set(activeGenerationsAtom, { [conversationId]: {} })
        await store.set(cancelGenerationAtom, conversationId)
        expect(cancel).not.toHaveBeenCalled()

        store.set(activeGenerationsAtom, { [conversationId]: { generationId } })
        await store.set(cancelGenerationAtom, conversationId)
        expect(cancel).toHaveBeenCalledWith(generationId)

        cancel.mockRejectedValueOnce(new Error('already finished'))
        await store.set(cancelGenerationAtom, conversationId)
        expect(store.get(workspaceErrorAtom)).toBe('already finished')
    })
})

import { afterAll, describe, expect, test } from 'bun:test'

import type { GenerationRequest } from '@malang/shared'

import { createTestApp } from '../../helpers/app'
import { createConversation, createEchoPreset } from '../../helpers/fixtures'

const t = await createTestApp({ login: false })
afterAll(() => t.close())

describe('continuing the last response', () => {
    function conversationWith(message: string, delayMs = 0) {
        const preset = createEchoPreset(t, { message, delayMs })
        return createConversation(t, { modelPresetId: preset.id }).id
    }

    function start(conversationId: string, request: Partial<GenerationRequest>) {
        return t.context.generations.start(
            conversationId,
            {
                mode: 'reply',
                content: '',
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: crypto.randomUUID(),
                ...request,
            } as GenerationRequest,
            crypto.randomUUID(),
        )
    }

    async function run(conversationId: string, request: Partial<GenerationRequest>) {
        await new Response((await start(conversationId, request)).stream).text()
    }

    async function continueError(conversationId: string) {
        try {
            await start(conversationId, { mode: 'continue' })
            return null
        } catch (error) {
            return (error as Error).message
        }
    }

    test('appends the continuation to the same reply and records it as a new generation', async () => {
        const conversationId = conversationWith(' More.')
        await run(conversationId, { content: 'Hello' })
        const reply = t.context.store.message.lastAssistant(conversationId)!
        expect(reply.content).toBe('More.')

        t.context.store.requestDebug.clear()
        t.context.store.settings.update({ requestDebugEnabled: true })
        await run(conversationId, { mode: 'continue' })
        t.context.store.settings.update({ requestDebugEnabled: false })

        const continued = t.context.store.message.get(reply.id)!
        expect(continued).toMatchObject({ content: 'More. More.', status: 'complete' })
        expect(t.context.store.message.list(conversationId).at(-1)?.id).toBe(reply.id)
        expect(t.context.store.generation.listByMessage(reply.id)).toMatchObject([
            { outputText: ' More.', processedOutputText: 'More.' },
            { outputText: ' More.', processedOutputText: 'More. More.' },
        ])
        const sent = t.context.store.requestDebug.list()[0]?.request.body as {
            messages: Array<{ role: string; content: string }>
        }
        expect(sent.messages.at(-1)).toEqual({ role: 'assistant', content: 'More.' })
    })

    test('requires a reply after at least one other chat turn', async () => {
        const conversationId = conversationWith('Reply')
        const refusal = 'There is no assistant response to continue'
        expect(await continueError(conversationId)).toBe(refusal)

        t.context.store.message.create(conversationId, 'user', 'Only the user spoke', 'complete')
        expect(await continueError(conversationId)).toBe(refusal)
    })

    test('keeps the original reply when the continuation is cancelled', async () => {
        const conversationId = conversationWith('Slow', 5_000)
        t.context.store.message.create(conversationId, 'user', 'Hi', 'complete')
        const reply = t.context.store.message.create(
            conversationId,
            'assistant',
            'Kept',
            'complete',
        )

        const { generationId, stream } = await start(conversationId, { mode: 'continue' })
        const body = new Response(stream).text()
        expect(t.context.generations.cancel(generationId)).toBe(true)
        await body

        expect(t.context.store.message.get(reply.id)).toMatchObject({
            content: 'Kept',
            status: 'cancelled',
        })
    })
})

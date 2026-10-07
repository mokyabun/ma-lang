import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GENERAL_CHAT_CHARACTER_ID, type GenerationRequest } from '@malang/shared'

import { type AppContext, createContext } from '@/services'

import { appConfig } from '../support/fixtures'

describe('continuing the last response', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-continue-'))
    let context: AppContext

    beforeAll(async () => {
        context = await createContext(appConfig(directory))
    })

    afterAll(() => {
        context.close()
        rmSync(directory, { recursive: true, force: true })
    })

    function conversationWith(message: string, delayMs = 0) {
        const preset = context.store.modelPreset.create({
            name: `Echo ${crypto.randomUUID()}`,
            apiKeyId: null,
            config: {
                provider: 'echo',
                modelId: 'echo',
                defaults: {},
                providerOptions: { message, delayMs },
            },
        })
        return context.conversations.create({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: preset.id,
            greetingIndex: -1,
        }).id
    }

    function start(conversationId: string, request: Partial<GenerationRequest>) {
        return context.generations.start(
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
        const reply = context.store.message.lastAssistant(conversationId)!
        expect(reply.content).toBe('More.')

        context.store.requestDebug.clear()
        context.store.settings.update({ requestDebugEnabled: true })
        await run(conversationId, { mode: 'continue' })
        context.store.settings.update({ requestDebugEnabled: false })

        const continued = context.store.message.get(reply.id)!
        expect(continued).toMatchObject({ content: 'More. More.', status: 'complete' })
        expect(context.store.message.list(conversationId).at(-1)?.id).toBe(reply.id)
        expect(context.store.generation.listByMessage(reply.id)).toMatchObject([
            { outputText: ' More.', processedOutputText: 'More.' },
            { outputText: ' More.', processedOutputText: 'More. More.' },
        ])
        const sent = context.store.requestDebug.list()[0]?.request.body as {
            messages: Array<{ role: string; content: string }>
        }
        expect(sent.messages.at(-1)).toEqual({ role: 'assistant', content: 'More.' })
    })

    test('requires a reply after at least one other chat turn', async () => {
        const conversationId = conversationWith('Reply')
        const refusal = 'There is no assistant response to continue'
        expect(await continueError(conversationId)).toBe(refusal)

        context.store.message.create(conversationId, 'user', 'Only the user spoke', 'complete')
        expect(await continueError(conversationId)).toBe(refusal)
    })

    test('keeps the original reply when the continuation is cancelled', async () => {
        const conversationId = conversationWith('Slow', 5_000)
        context.store.message.create(conversationId, 'user', 'Hi', 'complete')
        const reply = context.store.message.create(conversationId, 'assistant', 'Kept', 'complete')

        const { generationId, stream } = await start(conversationId, { mode: 'continue' })
        const body = new Response(stream).text()
        expect(context.generations.cancel(generationId)).toBe(true)
        await body

        expect(context.store.message.get(reply.id)).toMatchObject({
            content: 'Kept',
            status: 'cancelled',
        })
    })
})

import { afterAll, describe, expect, test } from 'bun:test'

import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'

import { createTestApp } from '../../helpers/app'
import { createConversation, createOllamaPreset, importCard, v3Card } from '../../helpers/fixtures'
import { startFakeOllama } from '../../helpers/ollama'

const t = await createTestApp()
const ollama = startFakeOllama()
afterAll(async () => {
    await ollama.stop()
    await t.close()
})

async function ollamaConversation() {
    const characterId = (await importCard(t)).id
    const preset = createOllamaPreset(t, ollama.url)
    return createConversation(t, { characterId, modelPresetId: preset.id }).id
}

describe('generations', () => {
    test('imports a card, creates a conversation, and previews the compiled prompt', async () => {
        const card = v3Card({
            system_prompt: 'Character wrapper: {{original}}',
            post_history_instructions: 'Final instruction: {{original}}',
        })
        const imported = await t.send('/characters/import', {
            method: 'POST',
            headers: { 'x-filename': 'aria.json' },
            body: card,
        })
        expect(imported.status).toBe(201)
        const characterId = ((await imported.json()) as { character: { id: string } }).character.id

        const created = await t.send('/conversations', {
            method: 'POST',
            body: { characterId, title: 'Library chat' },
        })
        expect(created.status).toBe(201)
        const conversationId = ((await created.json()) as { id: string }).id
        t.context.store.message.create(
            conversationId,
            'user',
            'Tell me about the moon.',
            'complete',
        )

        const preview = await t.send(`/conversations/${conversationId}/prompt-preview`, {
            method: 'POST',
        })
        expect(preview.status).toBe(200)
        const body = (await preview.json()) as {
            messages: Array<{ content: string }>
            activatedLoreIds: string[]
        }
        // As in PocketRisu, the card system prompt never replaces the preset main prompt.
        expect(body.messages[0]!.content).not.toContain('Character wrapper:')
        expect(
            body.messages.some((message: { content: string }) =>
                message.content.startsWith('Final instruction:'),
            ),
        ).toBeTrue()
        expect(
            body.messages.some((message: { content: string }) =>
                message.content.includes('moon archive is restricted'),
            ),
        ).toBeTrue()
        expect(body.activatedLoreIds).toHaveLength(1)
    })

    test('streams Ollama output and blocks concurrent or duplicate generations', async () => {
        const conversationId = createConversation(t, {
            characterId: (await importCard(t)).id,
        }).id
        const configured = await t.send('/provider', {
            method: 'PUT',
            body: {
                provider: 'ollama',
                baseUrl: ollama.url,
                modelId: 'test-model',
                defaults: { maxContextTokens: 8192, maxOutputTokens: 128 },
            },
        })
        expect(configured.status).toBe(200)
        const conversation = t.context.store.conversation.get(conversationId)
        const preset = conversation
            ? t.context.store.promptPreset.get(conversation.promptPresetId)
            : null
        if (!preset) throw new Error('Missing request-debug preset')
        t.context.store.promptPreset.update(preset.id, {
            name: preset.name,
            blocks: preset.blocks,
            parameters: {
                ...preset.parameters,
                temperature: 0.42,
                topK: 37,
                minP: 0.07,
                frequencyPenalty: 0.2,
            },
            defaultVariables: preset.defaultVariables,
            toggles: preset.toggles,
            regexScripts: preset.regexScripts,
            moduleIntegrations: preset.moduleIntegrations,
            promptSettings: preset.promptSettings,
        })
        const debugDisabled = await t.send('/settings', {
            method: 'PATCH',
            body: { requestDebugEnabled: false },
        })
        expect(debugDisabled.status).toBe(200)
        const key = 'generation-stream-0001'
        const response = await t.send(`/conversations/${conversationId}/generations`, {
            method: 'POST',
            body: { mode: 'reply', content: 'Say hello', idempotencyKey: key },
        })
        expect(response.status).toBe(200)

        const concurrent = await t.send(`/conversations/${conversationId}/generations`, {
            method: 'POST',
            body: { mode: 'reply', content: 'Race', idempotencyKey: 'generation-stream-0002' },
        })
        expect(concurrent.status).toBe(409)
        const events = await response.text()
        expect(events).toContain('event: generation.started')
        expect(
            events.includes('event: message.delta') || events.includes('event: message.snapshot'),
        ).toBeTrue()
        expect(events).toContain('Hello from Ollama')
        expect(events).toContain('event: message.completed')

        const debugHistory = await t.send('/debug/requests')
        expect(debugHistory.status).toBe(200)
        const debugBody = (await debugHistory.json()) as {
            requests: Array<{
                provider: string
                request: {
                    endpoint: string
                    headers: Record<string, string>
                    body: { options: Record<string, unknown> }
                }
            }>
        }
        expect(debugBody.requests[0]).toMatchObject({
            provider: 'ollama',
            request: {
                endpoint: expect.stringContaining('/api/chat'),
                headers: { 'content-type': 'application/json' },
                body: {
                    options: {
                        temperature: 0.42,
                        top_k: 37,
                        min_p: 0.07,
                        frequency_penalty: 0.2,
                    },
                },
            },
        })

        const requestLogs = await t.send('/debug/request-logs')
        expect(requestLogs.status).toBe(200)
        const requestLogsBody = (await requestLogs.json()) as {
            requests: Array<{
                id: string
                statusCode: number
                modelId: string
                inputTokens: number | null
                outputTokens: number | null
                hasDetails: boolean
            }>
        }
        expect(requestLogsBody.requests[0]).toMatchObject({
            statusCode: 200,
            modelId: 'test-model',
            hasDetails: true,
        })

        const requestLogDetail = await t.send(
            `/debug/request-logs/${requestLogsBody.requests[0]!.id}`,
        )
        expect(requestLogDetail.status).toBe(200)
        const requestLogDetailBody = (await requestLogDetail.json()) as {
            requests: Array<{ request: { endpoint: string } }>
            response: string
        }
        expect(requestLogDetailBody.requests[0]?.request.endpoint).toContain('/api/chat')
        expect(requestLogDetailBody.response).toBe('Hello from Ollama')

        t.context.store.requestDebug.create({
            generationId: requestLogsBody.requests[0]!.id,
            conversationId,
            provider: 'ollama',
            modelId: 'test-model',
            parameters: preset.parameters,
            request: {
                endpoint: 'https://user:password@example.com/chat?api_key=secret',
                method: 'POST',
                headers: {
                    authorization: 'Bearer should-not-be-stored',
                    cookie: 'session=should-not-be-stored',
                    'content-type': 'application/json',
                },
                body: {
                    prompt: 'body is retained',
                    max_tokens: 512,
                    apiKey: 'body-secret-must-not-be-stored',
                },
            },
        })
        const sanitized = t.context.store.requestDebug.list()[0]!
        expect(sanitized.request.endpoint).not.toContain('password')
        expect(sanitized.request.endpoint).not.toContain('secret')
        expect(sanitized.request.headers).toMatchObject({
            authorization: '[redacted]',
            cookie: '[redacted]',
            'content-type': 'application/json',
        })
        expect(sanitized.request.body).toEqual({
            prompt: 'body is retained',
            max_tokens: 512,
            apiKey: '[redacted]',
        })

        const usage = await t.send('/debug/request-logs/usage')
        expect(usage.status).toBe(200)
        const usageBody = (await usage.json()) as {
            totals: { requests: number; outputTokens: number }
            models: Array<{ modelId: string; requests: number }>
        }
        expect(usageBody.totals.requests).toBeGreaterThanOrEqual(1)
        expect(usageBody.models.some((model) => model.modelId === 'test-model')).toBe(true)

        const assistant = t.context.store.message
            .list(conversationId)
            .findLast(
                (message) =>
                    message.role === 'assistant' && message.content === 'Hello from Ollama',
            )!
        const history = await t.send(
            `/conversations/${conversationId}/messages/${assistant.id}/generations`,
        )
        expect(history.status).toBe(200)
        const historyBody = (await history.json()) as {
            generations: Array<{ id: string; outputText: string }>
        }
        expect(historyBody.generations[0]?.outputText).toBe('Hello from Ollama')

        const selected = await t.send(
            `/conversations/${conversationId}/messages/${assistant.id}/generation`,
            { method: 'PUT', body: { generationId: historyBody.generations[0]!.id } },
        )
        expect(selected.status).toBe(200)

        const duplicate = await t.send(`/conversations/${conversationId}/generations`, {
            method: 'POST',
            body: { mode: 'reply', content: 'Again', idempotencyKey: key },
        })
        expect(duplicate.status).toBe(409)

        expect((await t.send('/debug/requests', { method: 'DELETE' })).status).toBe(200)

        const clearedLogs = await t.send('/debug/request-logs', { method: 'DELETE' })
        expect(clearedLogs.status).toBe(200)
        const afterClear = await t.call<{ requests: unknown[] }>('/debug/request-logs')
        expect(afterClear.requests).toEqual([])
        const usageAfterClear = await t.call<{ totals: { requests: number } }>(
            '/debug/request-logs/usage',
        )
        expect(usageAfterClear.totals.requests).toBeGreaterThanOrEqual(1)
    })

    test('continues generation after the client disconnects', async () => {
        const conversationId = await ollamaConversation()
        const response = await t.send(`/conversations/${conversationId}/generations`, {
            method: 'POST',
            body: {
                mode: 'reply',
                content: 'cancel the client stream but finish on the server',
                idempotencyKey: 'generation-disconnect-0001',
            },
        })
        const generationId = response.headers.get('x-generation-id')!

        await response.body!.cancel('browser closed')
        await Bun.sleep(550)

        const run = t.context.store.generation.get(generationId)
        expect(run).toMatchObject({ status: 'complete', outputText: 'Hello from Ollama' })
        expect(t.context.store.message.get(run!.messageId!)).toMatchObject({
            content: 'Hello from Ollama',
            status: 'complete',
        })
        const debugHistory = await t.call<{
            requests: Array<{ generationId: string; request: { body: unknown } }>
        }>('/debug/requests')
        expect(debugHistory.requests[0]).toMatchObject({ generationId })
        expect(debugHistory.requests[0]?.request.body).toBeDefined()
    })

    test('reuses a trailing user message when an empty reply is requested', async () => {
        const created = await t.send('/conversations', {
            method: 'POST',
            body: {
                characterId: GENERAL_CHAT_CHARACTER_ID,
                title: 'Empty reply reuse',
                modelPresetId: createOllamaPreset(t, ollama.url).id,
            },
        })
        expect(created.status).toBe(201)
        const id = ((await created.json()) as { id: string }).id
        const userMessage = t.context.store.message.create(id, 'user', 'Use this again', 'complete')

        const response = await t.send(`/conversations/${id}/generations`, {
            method: 'POST',
            body: { mode: 'reply', content: '', idempotencyKey: 'generation-empty-reuse-0001' },
        })
        expect(response.status).toBe(200)
        await response.text()

        const messages = t.context.store.message.list(id)
        expect(messages.filter((message) => message.role === 'user')).toEqual([userMessage])
        expect(messages.at(-1)).toMatchObject({
            role: 'assistant',
            content: 'Hello from Ollama',
            status: 'complete',
        })

        const rejected = await t.send(`/conversations/${id}/generations`, {
            method: 'POST',
            body: { mode: 'reply', content: '', idempotencyKey: 'generation-empty-reject-0001' },
        })
        expect(rejected.status).toBe(422)
    })

    test('propagates cancellation and preserves partial assistant output', async () => {
        const conversationId = await ollamaConversation()
        const response = await t.send(`/conversations/${conversationId}/generations`, {
            method: 'POST',
            body: {
                mode: 'reply',
                content: 'cancel this',
                idempotencyKey: 'generation-cancel-0001',
            },
        })
        const generationId = response.headers.get('x-generation-id')!
        await Bun.sleep(20)
        const cancelled = await t.send(`/generations/${generationId}`, { method: 'DELETE' })
        expect(cancelled.status).toBe(204)
        await response.text()
        const run = t.context.store.generation.get(generationId)
        expect(run?.status).toBe('cancelled')
        expect(run?.messageId).toBeTruthy()
        expect(t.context.store.message.get(run!.messageId!)).toMatchObject({
            content: 'Hello',
            status: 'cancelled',
        })
    })
})

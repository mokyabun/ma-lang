import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GENERAL_CHAT_CHARACTER_ID, type ImportEvent } from '@malang/shared'
import { unzipSync, zipSync } from 'fflate'

import { createApp } from '@/app'
import { createContext } from '@/bootstrap'
import type { AppContext } from '@/context'

import { testConfig } from './helpers/app'
import { login } from './helpers/app'
import { charxArchive, v3Card } from './helpers/fixtures'

describe('Hono API and SQLite persistence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-api-'))
    const config = testConfig(directory, {
        allowedOrigins: new Set(['https://chat.example']),
    })
    let context: AppContext
    let app: ReturnType<typeof createApp>
    let cookie = ''
    let adminPassword = 'correct horse battery staple'
    let characterId = ''
    let conversationId = ''
    let moduleId = ''
    let recoveredModuleId = ''
    let ollama: ReturnType<typeof Bun.serve>

    beforeAll(async () => {
        ollama = Bun.serve({
            port: 0,
            async fetch(request) {
                const url = new URL(request.url)
                if (url.pathname === '/api/version') return Response.json({ version: 'test' })
                if (url.pathname === '/api/tags')
                    return Response.json({ models: [{ name: 'test-model' }] })
                if (url.pathname !== '/api/chat') return new Response(null, { status: 404 })
                const body = (await request.json()) as { messages?: Array<{ content?: string }> }
                const slow = body.messages?.at(-1)?.content?.includes('cancel')
                return new Response(
                    new ReadableStream<Uint8Array>({
                        async start(controller) {
                            controller.enqueue(
                                new TextEncoder().encode('{"message":{"content":"Hello"}}\n'),
                            )
                            await Bun.sleep(slow ? 500 : 30)
                            if (request.signal.aborted) return
                            controller.enqueue(
                                new TextEncoder().encode(
                                    '{"message":{"content":" from Ollama"}}\n{"done":true,"prompt_eval_count":12,"eval_count":3}\n',
                                ),
                            )
                            controller.close()
                        },
                    }),
                    { headers: { 'content-type': 'application/x-ndjson' } },
                )
            },
        })
        context = await createContext(config)
        app = createApp(context)
        cookie = await login(app, adminPassword)
    })

    afterAll(async () => {
        context.close()
        await ollama.stop(true)
        rmSync(directory, { recursive: true, force: true })
    })

    test('imports a card, creates a conversation, and previews the compiled prompt', async () => {
        const card = v3Card({
            system_prompt: 'Character wrapper: {{original}}',
            post_history_instructions: 'Final instruction: {{original}}',
        })
        const imported = await app.request('/api/v1/characters/import', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json', 'x-filename': 'aria.json' },
            body: JSON.stringify(card),
        })
        expect(imported.status).toBe(201)
        characterId = ((await imported.json()) as { character: { id: string } }).character.id

        const created = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ characterId, title: 'Library chat' }),
        })
        expect(created.status).toBe(201)
        conversationId = ((await created.json()) as { id: string }).id
        context.store.message.create(conversationId, 'user', 'Tell me about the moon.', 'complete')

        const preview = await app.request(
            `/api/v1/conversations/${conversationId}/prompt-preview`,
            {
                method: 'POST',
                headers: { cookie },
            },
        )
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

    test('persists normalized data after reopening SQLite', async () => {
        const recoverable = context.store.promptModule.create(
            {
                name: 'Recoverable module',
                description: '',
                namespace: 'test.recoverable',
                enabledByDefault: false,
                prompts: [],
                toggles: [],
                backgroundEmbedding: '<style>.risu-chat { color: silver; }</style>',
                lorebook: [],
            },
            {
                type: 'risuModule',
                module: {
                    customModuleToggle: '',
                    lorebook: [{ content: '{{getglobalvar::toggle_recovered_after_restart}}' }],
                },
            },
        )
        recoveredModuleId = recoverable.id
        context.close()
        context = await createContext({ ...config, adminPassword: undefined })
        app = createApp(context)
        expect(context.store.character.get(characterId)?.name).toBe('Aria')
        expect(context.store.conversation.get(conversationId)?.title).toBe('Library chat')
        expect(context.store.message.list(conversationId)).toHaveLength(2)
        expect(context.store.promptModule.get(recoveredModuleId)?.toggles).toEqual([])
        expect(context.store.promptModule.get(recoveredModuleId)?.backgroundEmbedding).toContain(
            '.risu-chat',
        )
    })

    test('streams Ollama output and blocks concurrent or duplicate generations', async () => {
        const configured = await app.request('/api/v1/provider', {
            method: 'PUT',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                provider: 'ollama',
                baseUrl: ollama.url.origin,
                modelId: 'test-model',
                defaults: { maxContextTokens: 8192, maxOutputTokens: 128 },
            }),
        })
        expect(configured.status).toBe(200)
        const conversation = context.store.conversation.get(conversationId)
        const preset = conversation
            ? context.store.promptPreset.get(conversation.promptPresetId)
            : null
        if (!preset) throw new Error('Missing request-debug preset')
        context.store.promptPreset.update(preset.id, {
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
        const debugDisabled = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ requestDebugEnabled: false }),
        })
        expect(debugDisabled.status).toBe(200)
        const key = 'generation-stream-0001'
        const response = await app.request(`/api/v1/conversations/${conversationId}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'reply', content: 'Say hello', idempotencyKey: key }),
        })
        expect(response.status).toBe(200)

        const concurrent = await app.request(
            `/api/v1/conversations/${conversationId}/generations`,
            {
                method: 'POST',
                headers: { cookie, 'content-type': 'application/json' },
                body: JSON.stringify({
                    mode: 'reply',
                    content: 'Race',
                    idempotencyKey: 'generation-stream-0002',
                }),
            },
        )
        expect(concurrent.status).toBe(409)
        const events = await response.text()
        expect(events).toContain('event: generation.started')
        expect(
            events.includes('event: message.delta') || events.includes('event: message.snapshot'),
        ).toBeTrue()
        expect(events).toContain('Hello from Ollama')
        expect(events).toContain('event: message.completed')

        const debugHistory = await app.request('/api/v1/debug/requests', {
            headers: { cookie },
        })
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

        const requestLogs = await app.request('/api/v1/debug/request-logs', {
            headers: { cookie },
        })
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

        const requestLogDetail = await app.request(
            `/api/v1/debug/request-logs/${requestLogsBody.requests[0]!.id}`,
            { headers: { cookie } },
        )
        expect(requestLogDetail.status).toBe(200)
        const requestLogDetailBody = (await requestLogDetail.json()) as {
            requests: Array<{ request: { endpoint: string } }>
            response: string
        }
        expect(requestLogDetailBody.requests[0]?.request.endpoint).toContain('/api/chat')
        expect(requestLogDetailBody.response).toBe('Hello from Ollama')

        context.store.requestDebug.create({
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
        const sanitized = context.store.requestDebug.list()[0]!
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

        const usage = await app.request('/api/v1/debug/request-logs/usage', {
            headers: { cookie },
        })
        expect(usage.status).toBe(200)
        const usageBody = (await usage.json()) as {
            totals: { requests: number; outputTokens: number }
            models: Array<{ modelId: string; requests: number }>
        }
        expect(usageBody.totals.requests).toBeGreaterThanOrEqual(1)
        expect(usageBody.models.some((model) => model.modelId === 'test-model')).toBe(true)

        const assistant = context.store.message
            .list(conversationId)
            .findLast(
                (message) =>
                    message.role === 'assistant' && message.content === 'Hello from Ollama',
            )!
        const history = await app.request(
            `/api/v1/conversations/${conversationId}/messages/${assistant.id}/generations`,
            { headers: { cookie } },
        )
        expect(history.status).toBe(200)
        const historyBody = (await history.json()) as {
            generations: Array<{ id: string; outputText: string }>
        }
        expect(historyBody.generations[0]?.outputText).toBe('Hello from Ollama')

        const selected = await app.request(
            `/api/v1/conversations/${conversationId}/messages/${assistant.id}/generation`,
            {
                method: 'PUT',
                headers: { cookie, 'content-type': 'application/json' },
                body: JSON.stringify({ generationId: historyBody.generations[0]!.id }),
            },
        )
        expect(selected.status).toBe(200)

        const duplicate = await app.request(`/api/v1/conversations/${conversationId}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'reply', content: 'Again', idempotencyKey: key }),
        })
        expect(duplicate.status).toBe(409)

        expect(
            (
                await app.request('/api/v1/debug/requests', {
                    method: 'DELETE',
                    headers: { cookie },
                })
            ).status,
        ).toBe(200)

        const clearedLogs = await app.request('/api/v1/debug/request-logs', {
            method: 'DELETE',
            headers: { cookie },
        })
        expect(clearedLogs.status).toBe(200)
        const afterClear = (await (
            await app.request('/api/v1/debug/request-logs', { headers: { cookie } })
        ).json()) as { requests: unknown[] }
        expect(afterClear.requests).toEqual([])
        const usageAfterClear = (await (
            await app.request('/api/v1/debug/request-logs/usage', { headers: { cookie } })
        ).json()) as { totals: { requests: number } }
        expect(usageAfterClear.totals.requests).toBeGreaterThanOrEqual(1)
    })

    test('continues generation after the client disconnects', async () => {
        const response = await app.request(`/api/v1/conversations/${conversationId}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reply',
                content: 'cancel the client stream but finish on the server',
                idempotencyKey: 'generation-disconnect-0001',
            }),
        })
        const generationId = response.headers.get('x-generation-id')!

        await response.body!.cancel('browser closed')
        await Bun.sleep(550)

        const run = context.store.generation.get(generationId)
        expect(run).toMatchObject({ status: 'complete', outputText: 'Hello from Ollama' })
        expect(context.store.message.get(run!.messageId!)).toMatchObject({
            content: 'Hello from Ollama',
            status: 'complete',
        })
        const debugHistory = (await (
            await app.request('/api/v1/debug/requests', { headers: { cookie } })
        ).json()) as { requests: Array<{ generationId: string; request: { body: unknown } }> }
        expect(debugHistory.requests[0]).toMatchObject({ generationId })
        expect(debugHistory.requests[0]?.request.body).toBeDefined()
    })

    test('reuses a trailing user message when an empty reply is requested', async () => {
        const created = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                characterId: GENERAL_CHAT_CHARACTER_ID,
                title: 'Empty reply reuse',
            }),
        })
        expect(created.status).toBe(201)
        const id = ((await created.json()) as { id: string }).id
        const userMessage = context.store.message.create(id, 'user', 'Use this again', 'complete')

        const response = await app.request(`/api/v1/conversations/${id}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reply',
                content: '',
                idempotencyKey: 'generation-empty-reuse-0001',
            }),
        })
        expect(response.status).toBe(200)
        await response.text()

        const messages = context.store.message.list(id)
        expect(messages.filter((message) => message.role === 'user')).toEqual([userMessage])
        expect(messages.at(-1)).toMatchObject({
            role: 'assistant',
            content: 'Hello from Ollama',
            status: 'complete',
        })

        const rejected = await app.request(`/api/v1/conversations/${id}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reply',
                content: '',
                idempotencyKey: 'generation-empty-reject-0001',
            }),
        })
        expect(rejected.status).toBe(422)
    })

    test('propagates cancellation and preserves partial assistant output', async () => {
        const response = await app.request(`/api/v1/conversations/${conversationId}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reply',
                content: 'cancel this',
                idempotencyKey: 'generation-cancel-0001',
            }),
        })
        const generationId = response.headers.get('x-generation-id')!
        await Bun.sleep(20)
        const cancelled = await app.request(`/api/v1/generations/${generationId}`, {
            method: 'DELETE',
            headers: { cookie },
        })
        expect(cancelled.status).toBe(204)
        await response.text()
        const run = context.store.generation.get(generationId)
        expect(run?.status).toBe('cancelled')
        expect(run?.messageId).toBeTruthy()
        expect(context.store.message.get(run!.messageId!)).toMatchObject({
            content: 'Hello',
            status: 'cancelled',
        })
    })
})

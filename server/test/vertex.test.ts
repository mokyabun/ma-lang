import { afterEach, describe, expect, test } from 'bun:test'

import { ProviderConfigSchema } from '@malang/shared'

import { buildPocketRisuGeminiBody } from '../src/services/providers/gemini-rest'
import type { RuntimeProviderConfig } from '../src/services/providers/types'
import { toGeminiContents, VertexAdapter } from '../src/services/providers/vertex'

const originalFetch = globalThis.fetch
afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('Gemini message shaping (matches PocketRisu Model Preset google-gemini)', () => {
    test('hoists every system message into systemInstruction', () => {
        const result = toGeminiContents([
            { role: 'system', content: 'Main prompt' },
            { role: 'system', content: 'Description block' },
            { role: 'user', content: 'Hello' },
        ])

        expect(result.systemInstruction).toEqual({
            parts: [{ text: 'Main prompt\n\nDescription block' }],
        })
        expect(result.contents).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
    })

    test('hoists a later system message instead of folding it into user content', () => {
        const result = toGeminiContents([
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'A reminder' },
        ])

        expect(result.systemInstruction).toEqual({ parts: [{ text: 'A reminder' }] })
        expect(result.contents).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
    })

    test('maps assistant to model and preserves consecutive same-role turns', () => {
        const result = toGeminiContents([
            { role: 'user', content: 'One' },
            { role: 'user', content: 'Two' },
            { role: 'assistant', content: 'Reply' },
        ])

        expect(result.contents).toEqual([
            { role: 'user', parts: [{ text: 'One' }] },
            { role: 'user', parts: [{ text: 'Two' }] },
            { role: 'model', parts: [{ text: 'Reply' }] },
        ])
    })

    test('trims message boundaries exactly before building Gemini parts', () => {
        const result = toGeminiContents([
            { role: 'system', content: '\n  System prompt  \n' },
            { role: 'user', content: '\n\nUser prompt\n\n' },
            { role: 'assistant', content: '  Answer  ' },
        ])

        expect(result).toEqual({
            systemInstruction: { parts: [{ text: 'System prompt' }] },
            contents: [
                { role: 'user', parts: [{ text: 'User prompt' }] },
                { role: 'model', parts: [{ text: 'Answer' }] },
            ],
        })
    })

    test('omits systemInstruction when there is no leading system message', () => {
        const result = toGeminiContents([{ role: 'user', content: 'Hi' }])
        expect(result.systemInstruction).toBeUndefined()
    })
})

describe('PocketRisu-compatible Gemini REST body', () => {
    test('applies profile mapsTo fields and lets the adapter own prompt fields', () => {
        const runtime = pocketProfileConfig()
        expect(
            buildPocketRisuGeminiBody(
                runtime,
                [
                    { role: 'system', content: 'System A' },
                    { role: 'user', content: 'One' },
                    { role: 'system', content: 'System B' },
                    { role: 'user', content: 'Two' },
                ],
                { temperature: 1, maxOutputTokens: 25_000 },
            ),
        ).toEqual({
            generationConfig: {
                maxOutputTokens: 12_000,
                thinkingConfig: { thinkingLevel: 'high', includeThoughts: false },
                responseMimeType: 'text/plain',
            },
            contents: [
                { role: 'user', parts: [{ text: 'One' }] },
                { role: 'user', parts: [{ text: 'Two' }] },
            ],
            systemInstruction: { parts: [{ text: 'System A\n\nSystem B' }] },
        })
    })

    test('matches PocketRisu customBody and additional-parameter priority', () => {
        const runtime = pocketProfileConfig()
        runtime.providerOptions = {
            ...runtime.providerOptions,
            customBody: {
                generationConfig: { maxOutputTokens: 99 },
                contents: [{ role: 'model', parts: [{ text: 'must be replaced' }] }],
            },
            additionalParamsText:
                'generationConfig.maxOutputTokens=77\ngenerationConfig.temperature=0.4',
        }

        expect(
            buildPocketRisuGeminiBody(
                runtime,
                [
                    { role: 'system', content: 'System' },
                    { role: 'user', content: 'Actual prompt' },
                ],
                {},
            ),
        ).toEqual({
            generationConfig: { maxOutputTokens: 77, temperature: 0.4 },
            contents: [{ role: 'user', parts: [{ text: 'Actual prompt' }] }],
            systemInstruction: { parts: [{ text: 'System' }] },
        })
    })

    test('sends the wire body directly over Vertex REST and parses SSE', async () => {
        const calls: Array<{ url: string; body: unknown }> = []
        globalThis.fetch = (async (input, init) => {
            const url =
                typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
            const rawBody = init?.body
            calls.push({
                url,
                body: JSON.parse(typeof rawBody === 'string' ? rawBody : '{}'),
            })
            return new Response(
                'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n' +
                    'data: {"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":2}}\n\n',
                { headers: { 'content-type': 'text/event-stream' } },
            )
        }) as typeof fetch

        const output = []
        for await (const chunk of new VertexAdapter().streamChat(pocketProfileConfig(), {
            messages: [{ role: 'user', content: 'Hi' }],
            parameters: {},
            signal: new AbortController().signal,
        })) {
            output.push(chunk)
        }

        expect(calls[0]?.url).toContain(
            '/publishers/google/models/gemini-test:streamGenerateContent?alt=sse&key=secret',
        )
        expect(calls[0]?.body).toEqual(
            buildPocketRisuGeminiBody(pocketProfileConfig(), [{ role: 'user', content: 'Hi' }], {}),
        )
        expect(output).toEqual([
            { delta: 'Hello', usage: undefined },
            { delta: '', usage: { inputTokens: 10, outputTokens: 2 } },
        ])
    })
})

function pocketProfileConfig(): RuntimeProviderConfig {
    const envelope = {
        schemaVersion: 1 as const,
        profile: {
            id: 'vertex-test',
            displayName: 'Vertex Test',
            providerBaseId: 'vertex-gemini-native',
            modelId: 'gemini-test',
            endpoint: { kind: 'vertex-gemini' },
            auth: { kind: 'google-service-account', fields: [] },
            defaults: {},
            schema: [
                {
                    key: 'modelId',
                    type: 'string' as const,
                    label: 'Model',
                    mapsTo: { target: 'body' as const, path: 'model' },
                },
                {
                    key: 'maxOutputTokens',
                    type: 'integer' as const,
                    label: 'Max output',
                    mapsTo: {
                        target: 'body' as const,
                        path: 'generationConfig.maxOutputTokens',
                    },
                },
                {
                    key: 'thinkingLevel',
                    type: 'string' as const,
                    label: 'Thinking',
                    mapsTo: {
                        target: 'body' as const,
                        path: 'generationConfig.thinkingConfig.thinkingLevel',
                    },
                },
                {
                    key: 'includeThoughts',
                    type: 'boolean' as const,
                    label: 'Thoughts',
                    mapsTo: {
                        target: 'body' as const,
                        path: 'generationConfig.thinkingConfig.includeThoughts',
                    },
                },
                {
                    key: 'responseMimeType',
                    type: 'string' as const,
                    label: 'MIME',
                    mapsTo: {
                        target: 'body' as const,
                        path: 'generationConfig.responseMimeType',
                    },
                },
            ],
            uiSchema: { groups: [], fields: [] },
            capabilities: [],
            sourceUrls: [],
        },
        baseProvider: {
            id: 'vertex-gemini-native',
            displayName: 'Vertex Gemini',
            adapterKind: 'google-gemini',
            authKinds: [],
            endpointKinds: [],
            requestSchema: [],
            uiSchema: { groups: [], fields: [] },
            sourceUrls: [],
        },
    }
    const parsed = ProviderConfigSchema.parse({
        provider: 'vertex',
        modelId: 'gemini-test',
        projectId: '',
        location: 'global',
        defaults: { maxOutputTokens: 12_000 },
        credentialType: 'apiKey',
        providerOptions: {
            __pocketRisuProfile: {
                envelope,
                values: {
                    modelId: 'gemini-test',
                    maxOutputTokens: 12_000,
                    thinkingLevel: 'high',
                    includeThoughts: false,
                    responseMimeType: 'text/plain',
                },
            },
        },
    }) as RuntimeProviderConfig
    return { ...parsed, apiKey: 'secret' }
}

import { afterEach, describe, expect, test } from 'bun:test'

import { ProviderConfigSchema, type CompiledMessage, type ProviderKind } from '@malang/shared'

import { providerFor } from '@/services/providers'
import type { RuntimeProviderConfig } from '@/services/providers/types'

const originalFetch = globalThis.fetch
afterEach(() => {
    globalThis.fetch = originalFetch
})

const messages: CompiledMessage[] = [
    { role: 'system', content: 'System' },
    { role: 'user', content: 'Hello' },
]

function config(
    provider: ProviderKind,
    extra: Record<string, unknown> = {},
): RuntimeProviderConfig {
    const parsed = ProviderConfigSchema.parse({
        provider,
        modelId: 'test-model',
        defaults: {},
        providerOptions: {},
        ...extra,
    }) as RuntimeProviderConfig
    return {
        ...parsed,
        ...(typeof extra.apiKey === 'string' ? { apiKey: extra.apiKey } : {}),
    }
}

async function collect(runtime: RuntimeProviderConfig) {
    const output: string[] = []
    for await (const chunk of providerFor(runtime).streamChat(runtime, {
        messages,
        parameters: {},
        signal: new AbortController().signal,
    })) {
        output.push(chunk.delta)
    }
    return output.join('')
}

describe('PocketRisu provider compatibility', () => {
    test('streams OpenAI-compatible chat deltas', async () => {
        globalThis.fetch = (async () =>
            new Response(
                'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n' +
                    'data: {"choices":[{"delta":{"content":"world"}}]}\n\n' +
                    'data: [DONE]\n\n',
                { status: 200 },
            )) as unknown as typeof fetch
        expect(
            await collect(
                config('openai', {
                    apiKey: 'secret',
                    baseUrl: 'https://api.openai.test/v1',
                }),
            ),
        ).toBe('Hello world')
    })

    test('supports PocketRisu Ooba completions and OpenRouter routing options', async () => {
        const requests: Array<{ url: string; body: Record<string, unknown> }> = []
        globalThis.fetch = (async (input, init) => {
            const url =
                typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
            requests.push({
                url,
                body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
                    string,
                    unknown
                >,
            })
            if (url.includes('ooba')) {
                return Response.json({ choices: [{ text: 'Ooba' }] })
            }
            return new Response('data: {"choices":[{"delta":{"content":"Router"}}]}\n\n', {
                status: 200,
                headers: { 'content-type': 'text/event-stream' },
            })
        }) as typeof fetch
        expect(
            await collect(
                config('ooba', {
                    baseUrl: 'https://ooba.test/v1',
                    apiFormat: 'openai-completions',
                }),
            ),
        ).toBe('Ooba')
        expect(
            await collect(
                config('openrouter', {
                    apiKey: 'secret',
                    providerOptions: {
                        middleOut: true,
                        routing: { order: ['Anthropic'] },
                    },
                }),
            ),
        ).toBe('Router')
        expect(requests[0]?.url).toBe('https://ooba.test/v1/completions')
        expect(requests[1]?.body.transforms).toEqual(['middle-out'])
        expect(requests[1]?.body.provider).toEqual({ order: ['Anthropic'] })
    })

    test('streams Anthropic Messages deltas with Pocket role shaping', async () => {
        globalThis.fetch = (async () =>
            new Response(
                'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":4}}}\n\n' +
                    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude"}}\n\n' +
                    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
                { status: 200 },
            )) as unknown as typeof fetch
        expect(
            await collect(
                config('anthropic', {
                    apiKey: 'secret',
                    baseUrl: 'https://anthropic.test/v1',
                }),
            ),
        ).toBe('Claude')
    })

    test.each([
        ['cohere', { text: 'Cohere' }, 'Cohere'],
        ['kobold', { results: [{ text: 'Kobold' }] }, 'Kobold'],
        ['mancer', { results: [{ text: 'Mancer' }] }, 'Mancer'],
    ] as const)('reads the %s response format', async (provider, response, expected) => {
        globalThis.fetch = (async () => Response.json(response)) as unknown as typeof fetch
        expect(
            await collect(
                config(provider, { apiKey: 'secret', baseUrl: `https://${provider}.test` }),
            ),
        ).toBe(expected)
    })

    test('generates a developer Echo response', async () => {
        expect(
            await collect(
                config('echo', { providerOptions: { message: 'Echo Message', delayMs: 0 } }),
            ),
        ).toBe('Echo Message')
    })

    test.each([
        ['webllm', /browser GPU runtime/i],
        ['plugin', /browser plugins/i],
    ] as const)('explains why %s cannot run on the server', (provider, message) => {
        const runtime = config(provider)
        expect(() => providerFor(runtime).validateConfig(runtime)).toThrow(message)
    })
})

import { afterEach, describe, expect, test } from 'bun:test'

import {
    POCKET_RISU_PROFILE_OPTION,
    ProviderConfigSchema,
    type BiasEntry,
    type ProviderKind,
} from '@malang/shared'

import {
    type GenerationBias,
    novelAILogitBiasExp,
    novelListLogitBias,
    openAILogitBias,
    providerFor,
    sendsOpenAILogitBias,
} from '@/services/providers'
import type { RuntimeProviderConfig } from '@/services/providers/types'
import { loadEncoder } from '@/services/tokenizer/encoders'

const originalFetch = globalThis.fetch
afterEach(() => {
    globalThis.fetch = originalFetch
})

const cl100k = await loadEncoder('cl100k_base')
const encode = (text: string) => cl100k.encode(text)
const bias = (entries: BiasEntry[]): GenerationBias => ({ entries, encode })

function config(
    provider: ProviderKind,
    modelId = 'test-model',
    extra: Record<string, unknown> = {},
): RuntimeProviderConfig {
    return {
        ...(ProviderConfigSchema.parse({
            provider,
            modelId,
            defaults: {},
            providerOptions: {},
            baseUrl: 'https://provider.test/v1',
            ...extra,
        }) as RuntimeProviderConfig),
        apiKey: 'secret',
    }
}

async function requestBody(runtime: RuntimeProviderConfig, entries: BiasEntry[]) {
    let body: Record<string, unknown> = {}
    globalThis.fetch = (async (_input, init) => {
        body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
            string,
            unknown
        >
        if (runtime.provider === 'novelai') return Response.json({ output: 'ok' })
        if (runtime.provider === 'novellist') return Response.json({ data: ['ok'] })
        return new Response('data: [DONE]\n\n')
    }) as typeof fetch
    for await (const _chunk of providerFor(runtime).streamChat(runtime, {
        messages: [{ role: 'user', content: 'Hello' }],
        parameters: {},
        bias: bias(entries),
        signal: new AbortController().signal,
    }));
    return body
}

describe('PocketRisu OpenAI logit_bias', () => {
    test('biases every token of the string', () => {
        const tokens = Array.from(encode(' dragon slayer'))
        expect(openAILogitBias(bias([[' dragon slayer', 30]]))).toEqual(
            Object.fromEntries(tokens.map((token) => [token, 30])),
        )
    })

    test('reads [[id]] as a raw token ID with parseInt semantics', () => {
        expect(
            openAILogitBias(
                bias([
                    ['[[42]]', -50],
                    ['[[0x1F]]', 7],
                    ['[[x]]', 1],
                ]),
            ),
        ).toEqual({
            42: -50,
            31: 7,
        })
    })

    test('lets later entries overwrite earlier ones', () => {
        const [token] = Array.from(encode('Hello'))
        expect(
            openAILogitBias(
                bias([
                    ['Hello', 10],
                    [`[[${token}]]`, -20],
                ]),
            ),
        ).toEqual({
            [token!]: -20,
        })
    })

    test('strong-bans the first token of the word glued to punctuation', () => {
        const result = openAILogitBias(bias([['Hello', -101]]))
        expect(Object.values(result).every((value) => value === -100)).toBe(true)
        expect(result[encode('Hello.')[0]!]).toBe(-100)
        expect(result[encode('"hello')[0]!]).toBeUndefined()
        expect(result[encode('.')[0]!]).toBeUndefined()
        expect(openAILogitBias(bias([['', -101]]))).toEqual({})
    })
})

describe('PocketRisu bias routing', () => {
    test('sends logit_bias only where the classic requestOpenAI path keeps it', () => {
        expect(sendsOpenAILogitBias(config('openai', 'gpt-4o'))).toBe(true)
        expect(sendsOpenAILogitBias(config('openai', 'o3-mini'))).toBe(false)
        expect(sendsOpenAILogitBias(config('openai-compatible'))).toBe(true)
        expect(sendsOpenAILogitBias(config('deepseek', 'deepseek-chat'))).toBe(true)
        expect(sendsOpenAILogitBias(config('openrouter'))).toBe(false)
        expect(sendsOpenAILogitBias(config('nanogpt'))).toBe(false)
        expect(sendsOpenAILogitBias(config('mistral'))).toBe(false)
    })

    test('never sends logit_bias for PocketRisu model profiles', () => {
        const profile = config('openai-compatible', 'gpt-4o', {
            providerOptions: {
                [POCKET_RISU_PROFILE_OPTION]: {
                    envelope: {
                        schemaVersion: 1,
                        profile: {
                            id: 'custom:gpt',
                            displayName: 'GPT',
                            providerBaseId: 'custom',
                            modelId: 'gpt-4o',
                            endpoint: { kind: 'fixed' },
                            auth: { kind: 'apiKey' },
                        },
                        baseProvider: {
                            id: 'custom',
                            displayName: 'Custom',
                            adapterKind: 'openai-chat',
                        },
                    },
                    values: {},
                },
            },
        })
        expect(sendsOpenAILogitBias(profile)).toBe(false)
    })

    test('adds logit_bias to OpenAI chat completions and omits it when empty', async () => {
        expect((await requestBody(config('openai', 'gpt-4o'), [['[[42]]', 5]])).logit_bias).toEqual(
            { 42: 5 },
        )
        expect(await requestBody(config('openai', 'gpt-4o'), [])).not.toHaveProperty('logit_bias')
        expect(await requestBody(config('openrouter'), [['[[42]]', 5]])).not.toHaveProperty(
            'logit_bias',
        )
    })

    test('sends NovelAI token sequences and NovelList raw strings', async () => {
        const entries: BiasEntry[] = [
            ['Hello', 10],
            ['bye', -101],
        ]
        expect(novelAILogitBiasExp(bias(entries))).toEqual([
            {
                sequence: Array.from(encode('Hello')),
                bias: 10,
                ensure_sequence_finish: false,
                generate_once: true,
            },
            {
                sequence: Array.from(encode('bye')),
                bias: -101,
                ensure_sequence_finish: false,
                generate_once: true,
            },
        ])
        const novelAI = await requestBody(config('novelai'), entries)
        expect((novelAI.parameters as Record<string, unknown>).logit_bias_exp).toHaveLength(2)

        expect(novelListLogitBias(entries)).toEqual({
            logit_bias: 'Hello<<|>>bye',
            logit_bias_values: '10|-101',
        })
        expect(novelListLogitBias([])).toEqual({})
        expect(await requestBody(config('novellist'), entries)).toMatchObject({
            logit_bias: 'Hello<<|>>bye',
            logit_bias_values: '10|-101',
        })
    })
})

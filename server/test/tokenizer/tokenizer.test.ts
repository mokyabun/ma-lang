import { describe, expect, test } from 'bun:test'

import { POCKET_RISU_PROFILE_OPTION, type ProviderKind } from '@malang/shared'

import { chatTokenizerFor, resolveTokenizerId } from '@/services/tokenizer'
import { type EncoderName, loadEncoder } from '@/services/tokenizer/encoders'

import golden from '../fixtures/tokenizer-golden.json'

// Token ids produced by RisuAI's own tokenizer code and vocabularies (Gemma via
// @huggingface/transformers' GemmaTokenizer), recorded outside Malang.
describe('tokenizer encoders', () => {
    for (const [name, ids] of Object.entries(golden.encoders)) {
        test(`${name} matches RisuAI`, async () => {
            const encoder = await loadEncoder(name as EncoderName)
            expect(Array.from(encoder.encode(golden.text))).toEqual(ids)
        })
    }

    test('gemma counts like RisuAI GemmaTokenizer', async () => {
        const tokenizer = await chatTokenizerFor({
            provider: 'vertex',
            modelId: 'gemini-3-flash-preview',
        })
        expect(tokenizer.count(golden.text)).toBe(golden.gemma.length)
    })

    test('counts special-token text instead of throwing', async () => {
        const tokenizer = await chatTokenizerFor({ provider: 'openai', modelId: 'gpt-4o' })
        expect(tokenizer.count('<|endoftext|>')).toBeGreaterThan(1)
    })
})

describe('tokenizer selection', () => {
    const model = (provider: ProviderKind, modelId: string) =>
        resolveTokenizerId({ provider, modelId })

    test('follows the Risu model list', () => {
        expect(model('openai', 'gpt-4')).toBe('cl100k_base')
        expect(model('openai', 'gpt-4-turbo')).toBe('cl100k_base')
        expect(model('openai', 'gpt-4o')).toBe('o200k_base')
        expect(model('openai', 'gpt-5.5')).toBe('o200k_base')
        expect(model('anthropic', 'claude-opus-4-1')).toBe('claude')
        expect(model('aws', 'anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe('claude')
        expect(model('vertex', 'gemini-2.5-pro')).toBe('gemma')
        expect(model('google', 'gemini-3-flash-preview')).toBe('gemma')
        expect(model('deepseek', 'deepseek-chat')).toBe('deepseek')
        expect(model('deepseek', 'deepseek-v4-pro')).toBe('deepseek-v4')
        expect(model('openrouter', 'anything')).toBe('o200k_base')
        expect(model('ollama', 'llama3')).toBe('cl100k_base')
        expect(resolveTokenizerId(null)).toBe('cl100k_base')
    })

    test('prefers the override, then the PocketRisu profile recommendation', () => {
        const providerOptions = {
            [POCKET_RISU_PROFILE_OPTION]: {
                envelope: {
                    schemaVersion: 1,
                    profile: {
                        id: 'vercel:claude-opus-5',
                        displayName: 'Claude Opus 5',
                        providerBaseId: 'vercel',
                        modelId: 'anthropic/claude-opus-5',
                        endpoint: { kind: 'fixed' },
                        auth: { kind: 'apiKey' },
                        recommendedTokenizer: 'claude',
                    },
                    baseProvider: {
                        id: 'vercel',
                        displayName: 'Vercel',
                        adapterKind: 'openai-chat',
                    },
                },
                values: {},
            },
        }
        const config = {
            provider: 'openai-compatible' as const,
            modelId: 'anthropic/claude-opus-5',
            providerOptions,
        }
        expect(resolveTokenizerId(config)).toBe('claude')
        expect(resolveTokenizerId({ ...config, tokenizer: 'glm5' })).toBe('glm5')
    })
})

describe('ChatTokenizer', () => {
    test('GPT models add five tokens per message and ignore names', async () => {
        const tokenizer = await chatTokenizerFor({ provider: 'openai', modelId: 'gpt-4o' })
        const content = tokenizer.count('Hello there')
        expect(tokenizer.tokenizeChat({ content: 'Hello there', name: 'Alice' })).toBe(content + 5)
    })

    test('other models add three tokens per message plus the name', async () => {
        const tokenizer = await chatTokenizerFor({ provider: 'anthropic', modelId: 'claude' })
        const content = tokenizer.count('Hello there')
        const name = tokenizer.count('Alice')
        expect(tokenizer.tokenizeChat({ content: 'Hello there' })).toBe(content + 3)
        expect(tokenizer.tokenizeChat({ content: 'Hello there', name: 'Alice' })).toBe(
            content + 3 + name + 1,
        )
    })
})

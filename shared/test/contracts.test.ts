import { describe, expect, test } from 'bun:test'

import {
    AppSettingsSchema,
    GenerationEventSchema,
    GenerationRequestSchema,
    LongTermMemorySettingsPatchSchema,
    ModelChainPresetInputSchema,
    ProviderConfigSchema,
} from '../src'

describe('shared contracts', () => {
    test('removes legacy settings from parsed API output', () => {
        const settings = AppSettingsSchema.parse({
            userName: 'Mina',
            persona: 'legacy text',
            globalVariables: {},
            defaultPromptPresetId: null,
            selectedPersonaId: null,
        })

        expect('persona' in settings).toBeFalse()
    })

    test('long-term memory patches do not materialize unspecified defaults', () => {
        expect(LongTermMemorySettingsPatchSchema.parse({ enabled: true })).toEqual({
            enabled: true,
        })
    })

    test.each([
        'openai',
        'openrouter',
        'anthropic',
        'google',
        'vertex',
        'mistral',
        'cohere',
        'novelai',
        'novellist',
        'horde',
        'aws',
        'deepseek',
        'deepinfra',
        'nanogpt',
        'openai-compatible',
        'ooba',
        'mancer',
        'kobold',
        'ollama',
        'echo',
        'webllm',
        'plugin',
    ])('accepts the %s provider configuration', (provider) => {
        expect(
            ProviderConfigSchema.parse({
                provider,
                modelId: 'model',
                ...(provider === 'vertex' ? { projectId: '', location: 'global' } : {}),
                ...(provider === 'aws' ? { region: 'us-east-1' } : {}),
                ...(provider === 'ollama' ? { baseUrl: 'http://127.0.0.1:11434' } : {}),
            }).provider,
        ).toBe(provider)
    })

    test('validates message delta events', () => {
        const event = {
            type: 'message.delta' as const,
            generationId: crypto.randomUUID(),
            messageId: crypto.randomUUID(),
            delta: 'x',
        }
        expect(GenerationEventSchema.parse(event)).toEqual(event)
    })

    test('requires idempotency keys for generations', () => {
        expect(() => GenerationRequestSchema.parse({ mode: 'reply', content: 'hello' })).toThrow()
    })

    test('validates server-side model chain presets', () => {
        const modelPresetId = crypto.randomUUID()
        const parsed = ModelChainPresetInputSchema.parse({
            name: 'Narrative review',
            description: 'Analyze, answer, then polish.',
            layers: [
                {
                    id: crypto.randomUUID(),
                    name: 'Analysis layer',
                    phase: 'pre',
                    agents: [
                        {
                            id: crypto.randomUUID(),
                            name: 'Continuity check',
                            modelPresetId,
                        },
                    ],
                },
            ],
        })
        expect(parsed.layers[0]?.agents[0]).toMatchObject({
            enabled: true,
            postMode: 'replace',
            includeSettingInfo: true,
            includeLongTermMemory: true,
        })
        expect(() =>
            ModelChainPresetInputSchema.parse({
                name: 'Empty chain',
                description: '',
                layers: [],
            }),
        ).toThrow()
    })
})

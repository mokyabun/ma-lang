import { describe, expect, test } from 'bun:test'

import { exportPromptPreset, importPromptPreset } from '@/services/prompt/preset-codec'
import { encodeRPack } from '@/services/prompt/rpack'

describe('Risu preset codec', () => {
    const input = {
        name: 'Risu-compatible',
        blocks: [
            {
                id: 'main',
                enabled: true,
                type: 'plain' as const,
                type2: 'main' as const,
                role: 'system' as const,
                text: 'Hello',
            },
        ],
        parameters: {
            temperature: 0.72,
            topP: 0.9,
            minP: 0.08,
            topA: 0.12,
            frequencyPenalty: 0.4,
            presencePenalty: -0.2,
            maxContextTokens: 4096,
            maxOutputTokens: 300,
        },
        defaultVariables: { mood: 'calm' },
        toggles: [
            {
                key: 'style',
                label: 'Style',
                type: 'select' as const,
                options: ['Quiet', 'Loud'],
                defaultValue: '0',
            },
        ],
        regexScripts: [
            {
                id: 'regex-1',
                comment: 'Display style',
                pattern: 'Hello',
                replacement: 'Hi',
                phase: 'editdisplay' as const,
                enabled: true,
                flags: 'g',
            },
        ],
        moduleIntegrations: ['test.module'],
        promptSettings: {
            assistantPrefill: 'Aria:',
            postEndInnerFormat: '',
            sendChatAsSystem: false,
            sendName: true,
            trimStartNewChat: false,
            groupTemplate: '',
        },
    }

    test('round-trips encrypted .risupreset values', async () => {
        const bytes = await exportPromptPreset(input, 'risupreset')
        const decoded = await importPromptPreset(bytes, 'test.risupreset')
        expect(decoded.input.name).toBe(input.name)
        expect(decoded.input.parameters.temperature).toBeCloseTo(0.72)
        expect(decoded.input.parameters.minP).toBeCloseTo(0.08)
        expect(decoded.input.parameters.topA).toBeCloseTo(0.12)
        expect(decoded.input.parameters.frequencyPenalty).toBeCloseTo(0.4)
        expect(decoded.input.parameters.presencePenalty).toBeCloseTo(-0.2)
        expect(decoded.input.blocks[0]).toMatchObject({ type: 'plain', text: 'Hello' })
        expect(decoded.input.defaultVariables).toEqual({ mood: 'calm' })
        expect(decoded.input.toggles?.[0]).toMatchObject({ key: 'style', type: 'select' })
        expect(decoded.input.regexScripts?.[0]).toMatchObject({ pattern: 'Hello' })
        expect(decoded.input.moduleIntegrations).toEqual(['test.module'])
        expect(decoded.input.promptSettings?.assistantPrefill).toBe('Aria:')
    })

    test('imports and exports RPack-obfuscated .risup values', async () => {
        const exported = await exportPromptPreset(input, 'risup')
        const decoded = await importPromptPreset(exported, 'shared.risup')
        expect(decoded.input.name).toBe(input.name)
        expect(decoded.input.blocks[0]).toMatchObject({ type: 'plain', text: 'Hello' })
        expect(decoded.input.toggles?.[0]).toMatchObject({ key: 'style' })

        const legacy = await exportPromptPreset(input, 'risupreset')
        const wrappedLegacy = encodeRPack(legacy)
        const legacyDecoded = await importPromptPreset(wrappedLegacy, 'legacy.risup')
        expect(legacyDecoded.input.regexScripts?.[0]).toMatchObject({ pattern: 'Hello' })
    })

    test('drops secrets and disables unsupported blocks', async () => {
        const raw = new TextEncoder().encode(
            JSON.stringify({
                name: 'Unsafe',
                openAIKey: 'secret',
                forceReplaceUrl: 'https://proxy.invalid',
                aiModel: 'ignored',
                promptTemplate: [{ type: 'memory', id: 'memory', enabled: true, payload: 'keep' }],
            }),
        )
        const decoded = await importPromptPreset(raw, 'unsafe.json')
        expect(decoded.source.openAIKey).toBeUndefined()
        expect(decoded.source.forceReplaceUrl).toBeUndefined()
        expect(decoded.source.aiModel).toBeUndefined()
        expect(decoded.input.blocks[0]).toMatchObject({ type: 'memory', enabled: false })
        expect(decoded.warnings).toHaveLength(1)
    })

    test('imports RisuAI -1000 parameter sentinels as unset', async () => {
        const raw = new TextEncoder().encode(
            JSON.stringify({
                name: 'Provider defaults',
                temperature: -1000,
                top_p: -1000,
                top_k: -1000,
                repetition_penalty: -1000,
                maxContext: 8192,
                maxResponse: 512,
            }),
        )

        const decoded = await importPromptPreset(raw, 'provider-defaults.json')

        expect(decoded.input.parameters).toEqual({
            temperature: undefined,
            topP: undefined,
            topK: undefined,
            minP: undefined,
            topA: undefined,
            repetitionPenalty: undefined,
            frequencyPenalty: undefined,
            presencePenalty: undefined,
            maxContextTokens: 8192,
            maxOutputTokens: 512,
            stopSequences: undefined,
        })
    })
})

import { describe, expect, test } from 'bun:test'

import type { PromptPreset } from '@malang/shared'
import { testId } from '@test/helpers/fixtures'

import { blankBlock, blankPreset, presetInput } from '@/features/prompt-presets/model'

describe('prompt preset drafts', () => {
    test('start with the RisuAI block order and fresh block ids', () => {
        const preset = blankPreset()
        expect(preset.blocks.map((block) => block.type)).toEqual([
            'plain',
            'description',
            'persona',
            'lorebook',
            'chat',
            'authornote',
        ])
        expect(new Set(preset.blocks.map((block) => block.id)).size).toBe(6)
        expect(preset.parameters).toEqual({
            temperature: 0.9,
            maxContextTokens: 8192,
            maxOutputTokens: 512,
        })
    })

    test('give each block type its own defaults', () => {
        expect(blankBlock('plain')).toMatchObject({ type2: 'main', role: 'system' })
        expect(blankBlock('chat')).toMatchObject({ rangeStart: 0, rangeEnd: 'end' })
        expect(blankBlock('authornote')).toMatchObject({ innerFormat: '{{slot}}', defaultText: '' })
        expect(blankBlock('persona')).toMatchObject({ innerFormat: '{{slot}}', role2: 'system' })
    })

    test('copy a saved preset into an input the editor can mutate freely', () => {
        const blank = blankPreset()
        const saved: PromptPreset = {
            ...blank,
            toggles: [],
            regexScripts: [],
            promptSettings: blank.promptSettings!,
            id: testId(900),
            defaultVariables: { mood: 'calm' },
            bias: [['hello', 5]],
            moduleIntegrations: ['module'],
            warnings: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        }
        const input = presetInput(saved)

        expect(input).not.toHaveProperty('id')
        expect(input).toEqual({
            name: saved.name,
            blocks: saved.blocks,
            parameters: saved.parameters,
            defaultVariables: saved.defaultVariables,
            toggles: saved.toggles,
            regexScripts: saved.regexScripts,
            moduleIntegrations: saved.moduleIntegrations,
            bias: saved.bias,
            promptSettings: saved.promptSettings,
        })

        input.blocks[0]!.enabled = false
        input.parameters.temperature = 0
        input.bias![0]![1] = 0
        input.moduleIntegrations!.push('other')
        expect(saved.blocks[0]!.enabled).toBe(true)
        expect(saved.parameters.temperature).toBe(0.9)
        expect(saved.bias).toEqual([['hello', 5]])
        expect(saved.moduleIntegrations).toEqual(['module'])
    })
})

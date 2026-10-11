import { describe, expect, test } from 'bun:test'

import type { PromptModule } from '@malang/shared'
import { makeAsset, makeLoreEntry, testId } from '@test/helpers/fixtures'

import { blankModule, blankModulePrompt, moduleInput } from '@/features/prompt-modules/model'

function savedModule(): PromptModule {
    return {
        ...blankModule(),
        sourceId: '',
        runtimeOrder: 0,
        toggles: [],
        regexScripts: [],
        backgroundEmbedding: '',
        id: testId(950),
        name: 'Weather',
        lorebook: [makeLoreEntry({ name: 'Rain' })],
        luaScript: {
            code: 'print(1)',
            enabled: true,
            lowLevelAccess: true,
            revision: 2,
            codeSha256: 'b'.repeat(64),
        },
        luaRawTriggers: [{ type: 'start' }],
        assets: [{ ...makeAsset(), size: 4 }],
        warnings: ['imported with warnings'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    }
}

describe('prompt module drafts', () => {
    test('start with one enabled system prompt after the main prompt', () => {
        const module = blankModule()
        expect(module.prompts).toHaveLength(1)
        expect(module.prompts[0]).toMatchObject({
            enabled: true,
            role: 'system',
            position: 'afterMain',
            toggleKey: null,
        })
        expect(blankModulePrompt().id).not.toBe(module.prompts[0]!.id)
    })

    test('keep only the input fields and the editable part of the Lua script', () => {
        const saved = savedModule()
        const input = moduleInput(saved)
        for (const key of ['id', 'assets', 'warnings', 'createdAt', 'updatedAt']) {
            expect(input).not.toHaveProperty(key)
        }
        expect(input.luaScript).toEqual({ code: 'print(1)', enabled: true, lowLevelAccess: true })
        expect(input.lorebook).toEqual(saved.lorebook)
    })

    test('detach nested values so edits do not touch the saved module', () => {
        const saved = savedModule()
        const input = moduleInput(saved)
        input.prompts[0]!.content = 'edited'
        input.lorebook[0]!.name = 'Snow'
        input.luaRawTriggers!.push({ type: 'output' })
        expect(saved.prompts[0]!.content).toBe('')
        expect(saved.lorebook[0]!.name).toBe('Rain')
        expect(saved.luaRawTriggers).toHaveLength(1)
    })
})

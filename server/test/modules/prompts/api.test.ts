import { afterAll, describe, expect, test } from 'bun:test'

import type { PromptPreset } from '@malang/shared'

import { createTestApp } from '../../helpers/app'
import { createConversation, importCard } from '../../helpers/fixtures'

const t = await createTestApp()
afterAll(() => t.close())

/** A copy of the default prompt preset, so a test can change it without affecting the others. */
function copyDefaultPreset(changes: Partial<PromptPreset> = {}) {
    const preset = t.context.store.promptPreset.get(
        t.context.store.settings.get().defaultPromptPresetId!,
    )!
    return t.context.store.promptPreset.create({
        name: `Preset ${crypto.randomUUID()}`,
        blocks: preset.blocks,
        parameters: preset.parameters,
        defaultVariables: preset.defaultVariables,
        toggles: preset.toggles,
        regexScripts: preset.regexScripts,
        moduleIntegrations: preset.moduleIntegrations,
        promptSettings: preset.promptSettings,
        ...changes,
    })
}

describe('prompt presets', () => {
    test('follows the global prompt unless a conversation locks its preset', async () => {
        const character = await importCard(t)
        const conversationId = createConversation(t, { characterId: character.id }).id
        const originalPresetId = t.context.store.settings.get().defaultPromptPresetId
        const originalPreset = originalPresetId
            ? t.context.store.promptPreset.get(originalPresetId)
            : null
        if (!originalPreset) throw new Error('Missing global prompt preset')
        const globalPreset = t.context.store.promptPreset.create({
            name: 'Global preset test',
            blocks: [
                {
                    id: crypto.randomUUID(),
                    enabled: true,
                    type: 'plain',
                    type2: 'normal',
                    role: 'system',
                    text: 'GLOBAL-PRESET-MARKER',
                },
                ...originalPreset.blocks,
            ],
            parameters: originalPreset.parameters,
            defaultVariables: originalPreset.defaultVariables,
            toggles: originalPreset.toggles,
            regexScripts: originalPreset.regexScripts,
            moduleIntegrations: originalPreset.moduleIntegrations,
            promptSettings: originalPreset.promptSettings,
        })
        const otherConversation = createConversation(t, { characterId: character.id })

        const lockPrompt = await t.send(`/conversations/${conversationId}`, {
            method: 'PATCH',
            body: { promptPresetId: originalPreset.id, promptPresetLocked: true },
        })
        expect(lockPrompt.status).toBe(200)

        const selected = await t.send('/settings', {
            method: 'PATCH',
            body: { defaultPromptPresetId: globalPreset.id },
        })
        expect(selected.status).toBe(200)

        const lockedPreview = await t.send(`/conversations/${conversationId}/prompt-preview`, {
            method: 'POST',
        })
        const lockedBody = (await lockedPreview.json()) as {
            messages: Array<{ content: string }>
        }
        expect(
            lockedBody.messages.some((message) => message.content.includes('GLOBAL-PRESET-MARKER')),
        ).toBeFalse()

        const unlockedPreview = await t.send(
            `/conversations/${otherConversation.id}/prompt-preview`,
            { method: 'POST' },
        )
        const unlockedBody = (await unlockedPreview.json()) as {
            messages: Array<{ content: string }>
        }
        expect(
            unlockedBody.messages.some((message) =>
                message.content.includes('GLOBAL-PRESET-MARKER'),
            ),
        ).toBeTrue()

        const unlockPrompt = await t.send(`/conversations/${conversationId}`, {
            method: 'PATCH',
            body: { promptPresetLocked: false },
        })
        expect(unlockPrompt.status).toBe(200)
        const previewAfterUnlock = await t.send(`/conversations/${conversationId}/prompt-preview`, {
            method: 'POST',
        })
        const afterUnlockBody = (await previewAfterUnlock.json()) as {
            messages: Array<{ content: string }>
        }
        expect(
            afterUnlockBody.messages.some((message) =>
                message.content.includes('GLOBAL-PRESET-MARKER'),
            ),
        ).toBeTrue()

        t.context.store.settings.update({ defaultPromptPresetId: originalPreset.id })
        expect(t.context.store.promptPreset.delete(globalPreset.id)).toBe('deleted')
    })

    test('imports and exports standalone Risu regex scripts on a prompt preset', async () => {
        const preset = copyDefaultPreset()
        const imported = await t.send(`/prompt-presets/${preset.id}/regex/import`, {
            method: 'POST',
            headers: { 'x-filename': 'regex.json' },
            body: {
                type: 'regex',
                data: [
                    {
                        comment: 'Standalone',
                        in: 'never-match-this',
                        out: 'replaced',
                        type: 'editoutput',
                        flag: 'g',
                        ableFlag: true,
                    },
                ],
            },
        })
        expect(imported.status).toBe(200)
        expect((await imported.json()) as object).toMatchObject({
            regexScripts: [{ comment: 'Standalone', phase: 'editoutput' }],
        })
        const exported = await t.send(`/prompt-presets/${preset.id}/regex/export`)
        expect(exported.status).toBe(200)
        expect((await exported.json()) as object).toMatchObject({
            type: 'regex',
            data: [{ comment: 'Standalone', type: 'editoutput' }],
        })
    })

    test('imports and exports RPack .risup prompt presets through the API', async () => {
        const preset = copyDefaultPreset({
            toggles: [
                {
                    key: 'quiet',
                    label: 'Quiet voice',
                    type: 'boolean',
                    options: [],
                    defaultValue: '0',
                },
            ],
            regexScripts: [
                {
                    id: crypto.randomUUID(),
                    comment: 'Standalone',
                    pattern: 'never-match-this',
                    replacement: 'replaced',
                    phase: 'editoutput',
                    enabled: true,
                    flags: 'g',
                },
            ],
        })
        const exported = await t.send(`/prompt-presets/${preset.id}/export?format=risup`)
        expect(exported.status).toBe(200)
        expect(exported.headers.get('content-disposition')).toContain('.risup')

        const imported = await t.send('/prompt-presets/import', {
            method: 'POST',
            headers: {
                'content-type': 'application/octet-stream',
                'x-filename': 'shared.risup',
            },
            body: new Uint8Array(await exported.arrayBuffer()),
        })
        expect(imported.status).toBe(201)
        expect((await imported.json()) as object).toMatchObject({
            toggles: [{ key: 'quiet', type: 'boolean' }],
            regexScripts: [{ comment: 'Standalone', phase: 'editoutput' }],
        })
    })
})

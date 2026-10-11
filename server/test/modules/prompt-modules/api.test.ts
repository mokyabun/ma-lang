import { afterAll, describe, expect, test } from 'bun:test'

import { unzipSync, zipSync } from 'fflate'

import { createTestApp } from '../../helpers/app'
import { createConversation, importCard } from '../../helpers/fixtures'

const t = await createTestApp()
afterAll(() => t.close())

describe('prompt modules', () => {
    test('runs prompt modules, lore, and toggles entirely on the server', async () => {
        const characterId = (await importCard(t)).id
        const conversationId = createConversation(t, { characterId }).id
        t.context.store.message.create(
            conversationId,
            'user',
            'Tell me about the moon.',
            'complete',
        )

        const conversation = t.context.store.conversation.get(conversationId)
        const preset = conversation
            ? t.context.store.promptPreset.get(conversation.promptPresetId)
            : null
        if (!preset) throw new Error('Missing integration prompt preset')
        t.context.store.promptPreset.update(preset.id, {
            name: preset.name,
            blocks: preset.blocks,
            parameters: preset.parameters,
            defaultVariables: preset.defaultVariables,
            toggles: [
                {
                    key: 'quiet',
                    label: 'Quiet voice',
                    type: 'boolean',
                    options: [],
                    defaultValue: '0',
                },
            ],
            regexScripts: preset.regexScripts,
            moduleIntegrations: preset.moduleIntegrations,
            promptSettings: preset.promptSettings,
        })
        const created = await t.send('/prompt-modules', {
            method: 'POST',
            body: {
                name: 'Moon style',
                description: 'Integration module',
                namespace: 'test.moon-style',
                enabledByDefault: false,
                prompts: [
                    {
                        id: crypto.randomUUID(),
                        name: 'Quiet style',
                        enabled: true,
                        toggleKey: 'module_quiet',
                        role: 'system',
                        position: 'afterMain',
                        content: 'Use a quiet archival voice.',
                    },
                ],
                toggles: [
                    {
                        key: 'module_quiet',
                        label: 'Module quiet voice',
                        type: 'boolean',
                        options: [],
                        defaultValue: '0',
                    },
                ],
                lorebook: [
                    {
                        id: crypto.randomUUID(),
                        keys: ['moon'],
                        secondaryKeys: [],
                        content: 'Module lore: silver keys open the west wing.',
                        enabled: true,
                        constant: false,
                        selective: false,
                        caseSensitive: false,
                        useRegex: false,
                        insertionOrder: 90,
                        priority: 90,
                        name: 'Silver keys',
                    },
                ],
            },
        })
        expect(created.status).toBe(201)
        const moduleId = ((await created.json()) as { id: string }).id
        const moduleAsset = await t.context.assets.put(
            new Uint8Array([137, 80, 78, 71]),
            'image/png',
        )
        t.context.store.promptModuleAsset.replace(moduleId, [
            {
                id: crypto.randomUUID(),
                moduleId,
                assetId: moduleAsset.id,
                type: 'other',
                name: 'moon-background',
                extension: 'png',
                sourceUri: 'test:moon-background',
            },
        ])

        const enabled = await t.send(`/conversations/${conversationId}/modules/${moduleId}`, {
            method: 'PUT',
            body: { enabled: true },
        })
        expect(enabled.status).toBe(200)
        expect((await enabled.json()) as object).toMatchObject({
            modules: [
                {
                    module: {
                        id: moduleId,
                        toggles: [{ key: 'module_quiet', type: 'boolean' }],
                        assets: [
                            {
                                assetId: moduleAsset.id,
                                name: 'moon-background',
                                mimeType: 'image/png',
                            },
                        ],
                    },
                    enabled: true,
                    inherited: false,
                },
            ],
        })

        const togglesUpdated = await t.send('/settings', {
            method: 'PATCH',
            body: { promptToggleValues: { quiet: '1', module_quiet: '1' } },
        })
        expect(togglesUpdated.status).toBe(200)
        expect(
            ((await togglesUpdated.json()) as { promptToggleValues: Record<string, string> })
                .promptToggleValues,
        ).toEqual({ quiet: '1', module_quiet: '1' })
        const preview = await t.send(`/conversations/${conversationId}/prompt-preview`, {
            method: 'POST',
        })
        const body = (await preview.json()) as {
            activeModuleIds: string[]
            messages: Array<{ content: string }>
        }
        expect(body.activeModuleIds).toEqual([moduleId])
        expect(
            body.messages.some((message) => message.content.includes('quiet archival')),
        ).toBeTrue()
        expect(body.messages.some((message) => message.content.includes('silver keys'))).toBeTrue()

        const secondConversationResponse = await t.send('/conversations', {
            method: 'POST',
            body: { characterId, promptPresetId: preset.id },
        })
        expect(secondConversationResponse.status).toBe(201)
        const secondConversationId = ((await secondConversationResponse.json()) as { id: string })
            .id
        await t.send(`/conversations/${secondConversationId}/modules/${moduleId}`, {
            method: 'PUT',
            body: { enabled: true },
        })
        const secondPreview = await t.send(
            `/conversations/${secondConversationId}/prompt-preview`,
            { method: 'POST' },
        )
        const secondBody = (await secondPreview.json()) as { messages: Array<{ content: string }> }
        expect(
            secondBody.messages.some((message) => message.content.includes('quiet archival')),
        ).toBeTrue()

        const exported = await t.send(`/prompt-modules/${moduleId}/export?format=risum`)
        expect(exported.status).toBe(200)
        expect(new Uint8Array(await exported.arrayBuffer())[0]).toBe(111)

        const charx = await t.send(`/prompt-modules/${moduleId}/export?format=charx`)
        expect(charx.status).toBe(200)
        const archive = unzipSync(new Uint8Array(await charx.arrayBuffer()))
        const card = JSON.parse(new TextDecoder().decode(archive['card.json'])) as {
            data: { extensions: { risuai: { moduleNamespace: string } } }
        }
        expect(card.data.extensions.risuai.moduleNamespace).toBe('test.moon-style')
        card.data.extensions.risuai.moduleNamespace = 'test.moon-style-copy'
        archive['card.json'] = new TextEncoder().encode(JSON.stringify(card))
        const imported = await t.send('/prompt-modules/import', {
            method: 'POST',
            headers: { 'content-type': 'application/zip', 'x-filename': 'moon.module.charx' },
            body: zipSync(archive),
        })
        expect(imported.status).toBe(201)
        expect((await imported.json()) as object).toMatchObject({
            namespace: 'test.moon-style-copy',
            prompts: [{ content: expect.stringContaining('quiet archival') }],
        })
    })

    test('round-trips a fully-populated lorebook entry through prompt module updates', async () => {
        const created = await t.send('/prompt-modules', {
            method: 'POST',
            body: {
                name: 'Lore Field Module',
                description: '',
                namespace: 'test.lore-fields',
                enabledByDefault: false,
                prompts: [],
                toggles: [],
                regexScripts: [],
                lorebook: [],
                assets: [],
            },
        })
        expect(created.status).toBe(201)
        const moduleRecord = (await created.json()) as { id: string }

        const fullEntry = {
            id: crypto.randomUUID(),
            keys: ['module-key'],
            secondaryKeys: ['module-secondary'],
            content: 'Module lore content.',
            enabled: true,
            constant: false,
            selective: true,
            caseSensitive: true,
            useRegex: false,
            insertionOrder: 3,
            priority: 4,
            name: 'Module lore',
            position: 'after_desc',
            depth: 0,
            role: 'assistant',
            scanDepth: 12,
            recursive: 'enabled',
            probability: 77,
            additionalKeys: ['module-extra'],
            excludeKeys: ['module-exclude'],
            fullWordMatching: false,
            decorators: {},
        }

        const updated = await t.send(`/prompt-modules/${moduleRecord.id}`, {
            method: 'PUT',
            body: {
                name: 'Lore Field Module',
                description: '',
                namespace: 'test.lore-fields',
                enabledByDefault: false,
                prompts: [],
                toggles: [],
                regexScripts: [],
                lorebook: [fullEntry],
                assets: [],
            },
        })
        expect(updated.status).toBe(200)

        const refetched = await t.send(`/prompt-modules/${moduleRecord.id}`)
        const body = (await refetched.json()) as { lorebook: Array<Record<string, unknown>> }
        expect(body.lorebook[0]).toMatchObject(fullEntry)
    })
})

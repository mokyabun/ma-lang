import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'
import { unzipSync, zipSync } from 'fflate'

import { createApp } from '../src/app'
import type { AppConfig } from '../src/config'
import { type AppContext, createContext } from '../src/services'
import { v3Card } from './fixtures'

describe('Hono API and SQLite persistence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-api-'))
    const config: AppConfig = {
        nodeEnv: 'test',
        autoBackupEnabled: false,
        host: '127.0.0.1',
        dataDir: directory,
        databasePath: join(directory, 'data.sqlite'),
        adminPassword: 'correct horse battery staple',
        sessionSecret: 'integration-session-secret-with-enough-entropy',
        allowedOrigins: new Set(['https://chat.example']),
        cookieSecure: false,
        port: 3000,
        logLevel: 'silent',
        logPretty: false,
        logColorize: false,
        limits: {
            importBytes: 128 << 20,
            jsonBytes: 8 << 20,
            assetBytes: 32 << 20,
            archiveEntries: 4096,
        },
    }
    let context: AppContext
    let app: ReturnType<typeof createApp>
    let cookie = ''
    let adminPassword = 'correct horse battery staple'
    let characterId = ''
    let conversationId = ''
    let moduleId = ''
    let recoveredModuleId = ''
    let ollama: ReturnType<typeof Bun.serve>

    beforeAll(async () => {
        ollama = Bun.serve({
            port: 0,
            async fetch(request) {
                const url = new URL(request.url)
                if (url.pathname === '/api/version') return Response.json({ version: 'test' })
                if (url.pathname === '/api/tags')
                    return Response.json({ models: [{ name: 'test-model' }] })
                if (url.pathname !== '/api/chat') return new Response(null, { status: 404 })
                const body = (await request.json()) as { messages?: Array<{ content?: string }> }
                const slow = body.messages?.at(-1)?.content?.includes('cancel')
                return new Response(
                    new ReadableStream<Uint8Array>({
                        async start(controller) {
                            controller.enqueue(
                                new TextEncoder().encode('{"message":{"content":"Hello"}}\n'),
                            )
                            await Bun.sleep(slow ? 500 : 30)
                            if (request.signal.aborted) return
                            controller.enqueue(
                                new TextEncoder().encode(
                                    '{"message":{"content":" from Ollama"}}\n{"done":true,"prompt_eval_count":12,"eval_count":3}\n',
                                ),
                            )
                            controller.close()
                        },
                    }),
                    { headers: { 'content-type': 'application/x-ndjson' } },
                )
            },
        })
        context = await createContext(config)
        app = createApp(context)
    })

    afterAll(async () => {
        context.close()
        await ollama.stop(true)
        rmSync(directory, { recursive: true, force: true })
    })

    test('protects API routes and creates an administrator session', async () => {
        expect((await app.request('/api/v1/settings')).status).toBe(401)
        const response = await app.request('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'https://chat.example' },
            body: JSON.stringify({ password: config.adminPassword }),
        })
        expect(response.status).toBe(200)
        cookie = response.headers.get('set-cookie')!.split(';')[0]!
        expect(cookie).toStartWith('malang_session=')
    })

    test('persists backup settings and exposes the environment override behind authentication', async () => {
        expect((await app.request('/api/v1/settings/backup')).status).toBe(401)
        const status = await app.request('/api/v1/settings/backup', { headers: { cookie } })
        expect(await status.json()).toEqual({ allowed: false })
        for (const enabled of [false, true]) {
            const response = await app.request('/api/v1/settings', {
                method: 'PATCH',
                headers: { cookie, 'content-type': 'application/json' },
                body: JSON.stringify({ autoBackupEnabled: enabled }),
            })
            expect(response.status).toBe(200)
            expect(await response.json()).toMatchObject({ autoBackupEnabled: enabled })
        }
        const invalid = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ autoBackupEnabled: 'false' }),
        })
        expect(invalid.status).toBe(422)
    })

    test('creates, lists, downloads, and deletes database snapshots', async () => {
        if (!cookie) {
            const login = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ password: config.adminPassword }),
            })
            cookie = login.headers.get('set-cookie')!.split(';')[0]!
        }
        const created = await app.request('/api/v1/settings/backups', {
            method: 'POST',
            headers: { cookie },
        })
        expect(created.status).toBe(201)
        const snapshot = (await created.json()) as { id: string; kind: string; size: number }
        expect(snapshot.kind).toBe('manual')
        expect(typeof snapshot.size).toBe('number')
        const snapshotSize = snapshot.size

        const listed = await app.request('/api/v1/settings/backups', { headers: { cookie } })
        expect(await listed.json()).toMatchObject({
            snapshots: [expect.objectContaining({ id: snapshot.id })],
        })

        const downloaded = await app.request(
            `/api/v1/settings/backups/${encodeURIComponent(snapshot.id)}/download`,
            { headers: { cookie } },
        )
        expect(downloaded.status).toBe(200)
        expect(downloaded.headers.get('content-type')).toBe('application/vnd.sqlite3')
        expect((await downloaded.arrayBuffer()).byteLength).toBe(snapshotSize)

        const deleted = await app.request(
            `/api/v1/settings/backups/${encodeURIComponent(snapshot.id)}`,
            { method: 'DELETE', headers: { cookie } },
        )
        expect(deleted.status).toBe(204)
    })

    test('returns stable structured errors with request IDs and validation issues', async () => {
        const malformed = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: '{',
        })
        expect(malformed.status).toBe(400)
        expect(await malformed.json()).toMatchObject({
            code: 'bad_request',
            message: 'Malformed JSON body',
            requestId: expect.any(String),
        })

        const invalid = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: {
                cookie,
                'content-type': 'application/json',
                'x-request-id': 'validation-request',
            },
            body: JSON.stringify({ userName: 42 }),
        })
        expect(invalid.status).toBe(422)
        expect(invalid.headers.get('x-request-id')).toBe('validation-request')
        expect(await invalid.json()).toEqual({
            code: 'validation_failed',
            message: 'Request validation failed',
            details: {
                issues: [
                    expect.objectContaining({
                        path: ['userName'],
                        code: 'invalid_type',
                    }),
                ],
            },
            requestId: 'validation-request',
        })
    })

    test('rejects a state-changing request from an unapproved origin', async () => {
        const response = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' },
            body: '{}',
        })
        expect(response.status).toBe(403)
    })

    test('provides a fixed general Chat character that cannot be changed or deleted', async () => {
        const listed = await app.request('/api/v1/characters', { headers: { cookie } })
        expect(listed.status).toBe(200)
        expect(
            ((await listed.json()) as { characters: Array<{ id: string; name: string }> })
                .characters,
        ).toContainEqual(expect.objectContaining({ id: GENERAL_CHAT_CHARACTER_ID, name: 'Chat' }))

        const conversation = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ characterId: GENERAL_CHAT_CHARACTER_ID }),
        })
        expect(conversation.status).toBe(201)
        expect((await conversation.json()) as object).toMatchObject({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            title: 'Chat 1',
        })

        const secondConversation = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ characterId: GENERAL_CHAT_CHARACTER_ID }),
        })
        expect(secondConversation.status).toBe(201)
        expect((await secondConversation.json()) as object).toMatchObject({ title: 'Chat 2' })

        for (const [method, path, body] of [
            ['PATCH', `/api/v1/characters/${GENERAL_CHAT_CHARACTER_ID}`, { name: 'Changed' }],
            ['DELETE', `/api/v1/characters/${GENERAL_CHAT_CHARACTER_ID}`, undefined],
            ['DELETE', `/api/v1/characters/${GENERAL_CHAT_CHARACTER_ID}/permanent`, undefined],
        ] as const) {
            const response = await app.request(path, {
                method,
                headers: { cookie, 'content-type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            })
            expect(response.status).toBe(409)
        }

        expect(context.store.character.get(GENERAL_CHAT_CHARACTER_ID)?.name).toBe('Chat')
    })

    test('imports a card, creates a conversation, and previews the compiled prompt', async () => {
        const card = v3Card({
            system_prompt: 'Character wrapper: {{original}}',
            post_history_instructions: 'Final instruction: {{original}}',
        })
        const imported = await app.request('/api/v1/characters/import', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json', 'x-filename': 'aria.json' },
            body: JSON.stringify(card),
        })
        expect(imported.status).toBe(201)
        characterId = ((await imported.json()) as { character: { id: string } }).character.id

        const created = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ characterId, title: 'Library chat' }),
        })
        expect(created.status).toBe(201)
        conversationId = ((await created.json()) as { id: string }).id
        context.store.message.create(conversationId, 'user', 'Tell me about the moon.', 'complete')

        const preview = await app.request(
            `/api/v1/conversations/${conversationId}/prompt-preview`,
            {
                method: 'POST',
                headers: { cookie },
            },
        )
        expect(preview.status).toBe(200)
        const body = (await preview.json()) as {
            messages: Array<{ content: string }>
            activatedLoreIds: string[]
        }
        expect(body.messages[0]!.content).toContain('Character wrapper:')
        expect(
            body.messages.some((message: { content: string }) =>
                message.content.includes('moon archive is restricted'),
            ),
        ).toBeTrue()
        expect(body.activatedLoreIds).toHaveLength(1)
    })

    test('persists character and chat groups, ordering, and safe group removal', async () => {
        const characterGroupResponse = await app.request('/api/v1/characters/groups', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Archive keepers' }),
        })
        expect(characterGroupResponse.status).toBe(201)
        const characterGroup = (await characterGroupResponse.json()) as {
            id: string
            sortOrder: number
        }

        const organizedCharacters = await app.request('/api/v1/characters/organization', {
            method: 'PUT',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                groups: [{ id: characterGroup.id, sortOrder: 0 }],
                characters: [{ id: characterId, groupId: characterGroup.id, sortOrder: 0 }],
            }),
        })
        expect(organizedCharacters.status).toBe(200)
        expect(context.store.character.get(characterId)).toMatchObject({
            groupId: characterGroup.id,
            sortOrder: 0,
        })

        const chatGroupResponse = await app.request('/api/v1/conversations/groups', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ characterId, name: 'Moon research' }),
        })
        expect(chatGroupResponse.status).toBe(201)
        const chatGroup = (await chatGroupResponse.json()) as { id: string }

        const organizedChats = await app.request('/api/v1/conversations/organization', {
            method: 'PUT',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                characterId,
                groups: [{ id: chatGroup.id, sortOrder: 0 }],
                conversations: [{ id: conversationId, groupId: chatGroup.id, sortOrder: 0 }],
            }),
        })
        expect(organizedChats.status).toBe(200)
        expect(context.store.conversation.get(conversationId)).toMatchObject({
            groupId: chatGroup.id,
            sortOrder: 0,
        })

        expect(
            (
                await app.request(`/api/v1/conversations/groups/${chatGroup.id}`, {
                    method: 'DELETE',
                    headers: { cookie },
                })
            ).status,
        ).toBe(204)
        expect(context.store.conversation.get(conversationId)?.groupId).toBeNull()

        expect(
            (
                await app.request(`/api/v1/characters/groups/${characterGroup.id}`, {
                    method: 'DELETE',
                    headers: { cookie },
                })
            ).status,
        ).toBe(204)
        expect(context.store.character.get(characterId)?.groupId).toBeNull()
    })

    test('edits the complete card workspace and conversation opening state', async () => {
        const current = context.store.character.get(characterId)!
        const loreEntry = current.lorebook![0]!
        const loreId = loreEntry.id
        const edited = await app.request(`/api/v1/characters/${characterId}`, {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                description: 'An archivist who guards the lunar wing.',
                alternateGreetings: ['The archive remembered you.'],
                loreSettings: { scanDepth: 9, tokenBudget: 750, recursiveScanning: false },
                lorebook: [
                    {
                        ...loreEntry,
                        id: loreId,
                        content: 'The moon archive opens only after midnight.',
                    },
                ],
            }),
        })
        expect(edited.status).toBe(200)
        expect((await edited.json()) as object).toMatchObject({
            description: 'An archivist who guards the lunar wing.',
            loreSettings: { scanDepth: 9, tokenBudget: 750, recursiveScanning: false },
        })

        const avatar = await app.request(`/api/v1/characters/${characterId}/avatar`, {
            method: 'PUT',
            headers: { cookie, 'content-type': 'image/png', 'x-filename': 'avatar.png' },
            body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        })
        expect(avatar.status).toBe(200)
        const avatarBody = (await avatar.json()) as { avatarAssetId: string }
        expect(avatarBody.avatarAssetId).toBeTruthy()
        const assetResponse = await app.request(`/api/v1/characters/${characterId}/assets`, {
            headers: { cookie },
        })
        expect((await assetResponse.json()) as object).toMatchObject({
            assets: [{ assetId: avatarBody.avatarAssetId, type: 'icon', name: 'main' }],
        })

        const alternateConversation = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ characterId, greetingIndex: 0 }),
        })
        expect(alternateConversation.status).toBe(201)
        const alternate = (await alternateConversation.json()) as {
            id: string
            title: string
            greetingIndex: number
        }
        expect(alternate.greetingIndex).toBe(0)
        expect(alternate.title).toBe('Chat 2')
        expect(context.store.message.list(alternate.id)[0]?.content).toBe(
            'The archive remembered you.',
        )

        const switchedGreeting = await app.request(`/api/v1/conversations/${alternate.id}`, {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ greetingIndex: -1 }),
        })
        expect(switchedGreeting.status).toBe(200)
        expect((await switchedGreeting.json()) as object).toMatchObject({ greetingIndex: -1 })
        expect(context.store.message.list(alternate.id)[0]?.content).toBe(current.firstMessage)

        const annotated = await app.request(`/api/v1/conversations/${alternate.id}`, {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                authorNote: 'Keep this scene quiet.',
                variables: { trust: '2' },
            }),
        })
        expect(annotated.status).toBe(200)
        expect((await annotated.json()) as object).toMatchObject({
            authorNote: 'Keep this scene quiet.',
            variables: { trust: '2' },
        })

        expect(
            (
                await app.request(`/api/v1/characters/${characterId}`, {
                    method: 'DELETE',
                    headers: { cookie },
                })
            ).status,
        ).toBe(204)
        expect(
            (
                await app.request(`/api/v1/characters/${characterId}/restore`, {
                    method: 'POST',
                    headers: { cookie },
                })
            ).status,
        ).toBe(200)
    })

    test('permanently deletes conversations and characters with dependent history', async () => {
        const imported = await app.request('/api/v1/characters/import', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json', 'x-filename': 'delete-me.json' },
            body: JSON.stringify(v3Card({ name: 'Delete me' })),
        })
        const temporaryCharacterId = ((await imported.json()) as { character: { id: string } })
            .character.id
        const createConversation = () =>
            app.request('/api/v1/conversations', {
                method: 'POST',
                headers: { cookie, 'content-type': 'application/json' },
                body: JSON.stringify({ characterId: temporaryCharacterId }),
            })

        const first = (await (await createConversation()).json()) as { id: string }
        context.store.message.create(first.id, 'user', 'This history will be deleted.', 'complete')
        expect(
            (
                await app.request(`/api/v1/conversations/${first.id}/permanent`, {
                    method: 'DELETE',
                    headers: { cookie },
                })
            ).status,
        ).toBe(204)
        expect(context.store.conversation.get(first.id)).toBeNull()
        expect(context.store.message.list(first.id)).toEqual([])

        const second = (await (await createConversation()).json()) as { id: string }
        expect(
            (
                await app.request(`/api/v1/characters/${temporaryCharacterId}/permanent`, {
                    method: 'DELETE',
                    headers: { cookie },
                })
            ).status,
        ).toBe(204)
        expect(context.store.character.get(temporaryCharacterId)).toBeNull()
        expect(context.store.conversation.get(second.id)).toBeNull()
    })

    test('runs prompt modules, lore, and toggles entirely on the server', async () => {
        const conversation = context.store.conversation.get(conversationId)
        const preset = conversation
            ? context.store.promptPreset.get(conversation.promptPresetId)
            : null
        if (!preset) throw new Error('Missing integration prompt preset')
        context.store.promptPreset.update(preset.id, {
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
        const created = await app.request('/api/v1/prompt-modules', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
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
            }),
        })
        expect(created.status).toBe(201)
        moduleId = ((await created.json()) as { id: string }).id
        const moduleAsset = await context.assets.put(new Uint8Array([137, 80, 78, 71]), 'image/png')
        context.store.promptModuleAsset.replace(moduleId, [
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

        const enabled = await app.request(
            `/api/v1/conversations/${conversationId}/modules/${moduleId}`,
            {
                method: 'PUT',
                headers: { cookie, 'content-type': 'application/json' },
                body: JSON.stringify({ enabled: true }),
            },
        )
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

        const togglesUpdated = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                promptToggleValues: { quiet: '1', module_quiet: '1' },
            }),
        })
        expect(togglesUpdated.status).toBe(200)
        expect(
            ((await togglesUpdated.json()) as { promptToggleValues: Record<string, string> })
                .promptToggleValues,
        ).toEqual({ quiet: '1', module_quiet: '1' })
        const preview = await app.request(
            `/api/v1/conversations/${conversationId}/prompt-preview`,
            { method: 'POST', headers: { cookie } },
        )
        const body = (await preview.json()) as {
            activeModuleIds: string[]
            messages: Array<{ content: string }>
        }
        expect(body.activeModuleIds).toEqual([moduleId])
        expect(
            body.messages.some((message) => message.content.includes('quiet archival')),
        ).toBeTrue()
        expect(body.messages.some((message) => message.content.includes('silver keys'))).toBeTrue()

        const secondConversationResponse = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ characterId, promptPresetId: preset.id }),
        })
        expect(secondConversationResponse.status).toBe(201)
        const secondConversationId = ((await secondConversationResponse.json()) as { id: string })
            .id
        await app.request(`/api/v1/conversations/${secondConversationId}/modules/${moduleId}`, {
            method: 'PUT',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: true }),
        })
        const secondPreview = await app.request(
            `/api/v1/conversations/${secondConversationId}/prompt-preview`,
            { method: 'POST', headers: { cookie } },
        )
        const secondBody = (await secondPreview.json()) as { messages: Array<{ content: string }> }
        expect(
            secondBody.messages.some((message) => message.content.includes('quiet archival')),
        ).toBeTrue()

        const exported = await app.request(
            `/api/v1/prompt-modules/${moduleId}/export?format=risum`,
            { headers: { cookie } },
        )
        expect(exported.status).toBe(200)
        expect(new Uint8Array(await exported.arrayBuffer())[0]).toBe(111)

        const charx = await app.request(`/api/v1/prompt-modules/${moduleId}/export?format=charx`, {
            headers: { cookie },
        })
        expect(charx.status).toBe(200)
        const archive = unzipSync(new Uint8Array(await charx.arrayBuffer()))
        const card = JSON.parse(new TextDecoder().decode(archive['card.json'])) as {
            data: { extensions: { risuai: { moduleNamespace: string } } }
        }
        expect(card.data.extensions.risuai.moduleNamespace).toBe('test.moon-style')
        card.data.extensions.risuai.moduleNamespace = 'test.moon-style-copy'
        archive['card.json'] = new TextEncoder().encode(JSON.stringify(card))
        const imported = await app.request('/api/v1/prompt-modules/import', {
            method: 'POST',
            headers: {
                cookie,
                'content-type': 'application/zip',
                'x-filename': 'moon.module.charx',
            },
            body: zipSync(archive),
        })
        expect(imported.status).toBe(201)
        expect((await imported.json()) as object).toMatchObject({
            namespace: 'test.moon-style-copy',
            prompts: [{ content: expect.stringContaining('quiet archival') }],
        })
    })

    test('follows the global prompt unless a conversation locks its preset', async () => {
        const originalPresetId = context.store.settings.get().defaultPromptPresetId
        const originalPreset = originalPresetId
            ? context.store.promptPreset.get(originalPresetId)
            : null
        if (!originalPreset) throw new Error('Missing global prompt preset')
        const globalPreset = context.store.promptPreset.create({
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
        const otherConversation = context.store.conversation.create({
            characterId,
            greetingIndex: -1,
        })

        const lockPrompt = await app.request(`/api/v1/conversations/${conversationId}`, {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                promptPresetId: originalPreset.id,
                promptPresetLocked: true,
            }),
        })
        expect(lockPrompt.status).toBe(200)

        const selected = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ defaultPromptPresetId: globalPreset.id }),
        })
        expect(selected.status).toBe(200)

        const lockedPreview = await app.request(
            `/api/v1/conversations/${conversationId}/prompt-preview`,
            { method: 'POST', headers: { cookie } },
        )
        const lockedBody = (await lockedPreview.json()) as {
            messages: Array<{ content: string }>
        }
        expect(
            lockedBody.messages.some((message) => message.content.includes('GLOBAL-PRESET-MARKER')),
        ).toBeFalse()

        const unlockedPreview = await app.request(
            `/api/v1/conversations/${otherConversation.id}/prompt-preview`,
            { method: 'POST', headers: { cookie } },
        )
        const unlockedBody = (await unlockedPreview.json()) as {
            messages: Array<{ content: string }>
        }
        expect(
            unlockedBody.messages.some((message) =>
                message.content.includes('GLOBAL-PRESET-MARKER'),
            ),
        ).toBeTrue()

        const unlockPrompt = await app.request(`/api/v1/conversations/${conversationId}`, {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ promptPresetLocked: false }),
        })
        expect(unlockPrompt.status).toBe(200)
        const previewAfterUnlock = await app.request(
            `/api/v1/conversations/${conversationId}/prompt-preview`,
            { method: 'POST', headers: { cookie } },
        )
        const afterUnlockBody = (await previewAfterUnlock.json()) as {
            messages: Array<{ content: string }>
        }
        expect(
            afterUnlockBody.messages.some((message) =>
                message.content.includes('GLOBAL-PRESET-MARKER'),
            ),
        ).toBeTrue()

        context.store.settings.update({ defaultPromptPresetId: originalPreset.id })
        expect(context.store.promptPreset.delete(globalPreset.id)).toBe('deleted')
    })

    test('imports and exports standalone Risu regex scripts on a prompt preset', async () => {
        const conversation = context.store.conversation.get(conversationId)
        if (!conversation) throw new Error('Missing conversation')
        const imported = await app.request(
            `/api/v1/prompt-presets/${conversation.promptPresetId}/regex/import`,
            {
                method: 'POST',
                headers: {
                    cookie,
                    'content-type': 'application/json',
                    'x-filename': 'regex.json',
                },
                body: JSON.stringify({
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
                }),
            },
        )
        expect(imported.status).toBe(200)
        expect((await imported.json()) as object).toMatchObject({
            regexScripts: [{ comment: 'Standalone', phase: 'editoutput' }],
        })
        const exported = await app.request(
            `/api/v1/prompt-presets/${conversation.promptPresetId}/regex/export`,
            { headers: { cookie } },
        )
        expect(exported.status).toBe(200)
        expect((await exported.json()) as object).toMatchObject({
            type: 'regex',
            data: [{ comment: 'Standalone', type: 'editoutput' }],
        })
    })

    test('imports and exports RPack .risup prompt presets through the API', async () => {
        const conversation = context.store.conversation.get(conversationId)
        if (!conversation) throw new Error('Missing conversation')
        const exported = await app.request(
            `/api/v1/prompt-presets/${conversation.promptPresetId}/export?format=risup`,
            { headers: { cookie } },
        )
        expect(exported.status).toBe(200)
        expect(exported.headers.get('content-disposition')).toContain('.risup')

        const imported = await app.request('/api/v1/prompt-presets/import', {
            method: 'POST',
            headers: {
                cookie,
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

    test('persists normalized data after reopening SQLite', async () => {
        const recoverable = context.store.promptModule.create(
            {
                name: 'Recoverable module',
                description: '',
                namespace: 'test.recoverable',
                enabledByDefault: false,
                prompts: [],
                toggles: [],
                backgroundEmbedding: '<style>.risu-chat { color: silver; }</style>',
                lorebook: [],
            },
            {
                type: 'risuModule',
                module: {
                    customModuleToggle: '',
                    lorebook: [{ content: '{{getglobalvar::toggle_recovered_after_restart}}' }],
                },
            },
        )
        recoveredModuleId = recoverable.id
        context.close()
        context = await createContext({ ...config, adminPassword: undefined })
        app = createApp(context)
        expect(context.store.character.get(characterId)?.name).toBe('Aria')
        expect(context.store.conversation.get(conversationId)?.title).toBe('Library chat')
        expect(context.store.message.list(conversationId)).toHaveLength(2)
        expect(context.store.promptModule.get(recoveredModuleId)?.toggles).toEqual([])
        expect(context.store.promptModule.get(recoveredModuleId)?.backgroundEmbedding).toContain(
            '.risu-chat',
        )
    })

    test('streams Ollama output and blocks concurrent or duplicate generations', async () => {
        const configured = await app.request('/api/v1/provider', {
            method: 'PUT',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                provider: 'ollama',
                baseUrl: ollama.url.origin,
                modelId: 'test-model',
                defaults: { maxContextTokens: 8192, maxOutputTokens: 128 },
            }),
        })
        expect(configured.status).toBe(200)
        const conversation = context.store.conversation.get(conversationId)
        const preset = conversation
            ? context.store.promptPreset.get(conversation.promptPresetId)
            : null
        if (!preset) throw new Error('Missing request-debug preset')
        context.store.promptPreset.update(preset.id, {
            name: preset.name,
            blocks: preset.blocks,
            parameters: {
                ...preset.parameters,
                temperature: 0.42,
                topK: 37,
                minP: 0.07,
                frequencyPenalty: 0.2,
            },
            defaultVariables: preset.defaultVariables,
            toggles: preset.toggles,
            regexScripts: preset.regexScripts,
            moduleIntegrations: preset.moduleIntegrations,
            promptSettings: preset.promptSettings,
        })
        const debugDisabled = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ requestDebugEnabled: false }),
        })
        expect(debugDisabled.status).toBe(200)
        const key = 'generation-stream-0001'
        const response = await app.request(`/api/v1/conversations/${conversationId}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'reply', content: 'Say hello', idempotencyKey: key }),
        })
        expect(response.status).toBe(200)

        const concurrent = await app.request(
            `/api/v1/conversations/${conversationId}/generations`,
            {
                method: 'POST',
                headers: { cookie, 'content-type': 'application/json' },
                body: JSON.stringify({
                    mode: 'reply',
                    content: 'Race',
                    idempotencyKey: 'generation-stream-0002',
                }),
            },
        )
        expect(concurrent.status).toBe(409)
        const events = await response.text()
        expect(events).toContain('event: generation.started')
        expect(
            events.includes('event: message.delta') || events.includes('event: message.snapshot'),
        ).toBeTrue()
        expect(events).toContain('Hello from Ollama')
        expect(events).toContain('event: message.completed')

        const debugHistory = await app.request('/api/v1/debug/requests', {
            headers: { cookie },
        })
        expect(debugHistory.status).toBe(200)
        const debugBody = (await debugHistory.json()) as {
            requests: Array<{
                provider: string
                request: {
                    endpoint: string
                    headers: Record<string, string>
                    body: { options: Record<string, unknown> }
                }
            }>
        }
        expect(debugBody.requests[0]).toMatchObject({
            provider: 'ollama',
            request: {
                endpoint: expect.stringContaining('/api/chat'),
                headers: { 'content-type': 'application/json' },
                body: {
                    options: {
                        temperature: 0.42,
                        top_k: 37,
                        min_p: 0.07,
                        frequency_penalty: 0.2,
                    },
                },
            },
        })

        const requestLogs = await app.request('/api/v1/debug/request-logs', {
            headers: { cookie },
        })
        expect(requestLogs.status).toBe(200)
        const requestLogsBody = (await requestLogs.json()) as {
            requests: Array<{
                id: string
                statusCode: number
                modelId: string
                inputTokens: number | null
                outputTokens: number | null
                hasDetails: boolean
            }>
        }
        expect(requestLogsBody.requests[0]).toMatchObject({
            statusCode: 200,
            modelId: 'test-model',
            hasDetails: true,
        })

        const requestLogDetail = await app.request(
            `/api/v1/debug/request-logs/${requestLogsBody.requests[0]!.id}`,
            { headers: { cookie } },
        )
        expect(requestLogDetail.status).toBe(200)
        const requestLogDetailBody = (await requestLogDetail.json()) as {
            requests: Array<{ request: { endpoint: string } }>
            response: string
        }
        expect(requestLogDetailBody.requests[0]?.request.endpoint).toContain('/api/chat')
        expect(requestLogDetailBody.response).toBe('Hello from Ollama')

        context.store.requestDebug.create({
            generationId: requestLogsBody.requests[0]!.id,
            conversationId,
            provider: 'ollama',
            modelId: 'test-model',
            parameters: preset.parameters,
            request: {
                endpoint: 'https://user:password@example.com/chat?api_key=secret',
                method: 'POST',
                headers: {
                    authorization: 'Bearer should-not-be-stored',
                    cookie: 'session=should-not-be-stored',
                    'content-type': 'application/json',
                },
                body: {
                    prompt: 'body is retained',
                    max_tokens: 512,
                    apiKey: 'body-secret-must-not-be-stored',
                },
            },
        })
        const sanitized = context.store.requestDebug.list()[0]!
        expect(sanitized.request.endpoint).not.toContain('password')
        expect(sanitized.request.endpoint).not.toContain('secret')
        expect(sanitized.request.headers).toMatchObject({
            authorization: '[redacted]',
            cookie: '[redacted]',
            'content-type': 'application/json',
        })
        expect(sanitized.request.body).toEqual({
            prompt: 'body is retained',
            max_tokens: 512,
            apiKey: '[redacted]',
        })

        const usage = await app.request('/api/v1/debug/request-logs/usage', {
            headers: { cookie },
        })
        expect(usage.status).toBe(200)
        const usageBody = (await usage.json()) as {
            totals: { requests: number; outputTokens: number }
            models: Array<{ modelId: string; requests: number }>
        }
        expect(usageBody.totals.requests).toBeGreaterThanOrEqual(1)
        expect(usageBody.models.some((model) => model.modelId === 'test-model')).toBe(true)

        const assistant = context.store.message
            .list(conversationId)
            .findLast(
                (message) =>
                    message.role === 'assistant' && message.content === 'Hello from Ollama',
            )!
        const history = await app.request(
            `/api/v1/conversations/${conversationId}/messages/${assistant.id}/generations`,
            { headers: { cookie } },
        )
        expect(history.status).toBe(200)
        const historyBody = (await history.json()) as {
            generations: Array<{ id: string; outputText: string }>
        }
        expect(historyBody.generations[0]?.outputText).toBe('Hello from Ollama')

        const selected = await app.request(
            `/api/v1/conversations/${conversationId}/messages/${assistant.id}/generation`,
            {
                method: 'PUT',
                headers: { cookie, 'content-type': 'application/json' },
                body: JSON.stringify({ generationId: historyBody.generations[0]!.id }),
            },
        )
        expect(selected.status).toBe(200)

        const duplicate = await app.request(`/api/v1/conversations/${conversationId}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'reply', content: 'Again', idempotencyKey: key }),
        })
        expect(duplicate.status).toBe(409)

        expect(
            (
                await app.request('/api/v1/debug/requests', {
                    method: 'DELETE',
                    headers: { cookie },
                })
            ).status,
        ).toBe(200)

        const clearedLogs = await app.request('/api/v1/debug/request-logs', {
            method: 'DELETE',
            headers: { cookie },
        })
        expect(clearedLogs.status).toBe(200)
        const afterClear = (await (
            await app.request('/api/v1/debug/request-logs', { headers: { cookie } })
        ).json()) as { requests: unknown[] }
        expect(afterClear.requests).toEqual([])
        const usageAfterClear = (await (
            await app.request('/api/v1/debug/request-logs/usage', { headers: { cookie } })
        ).json()) as { totals: { requests: number } }
        expect(usageAfterClear.totals.requests).toBeGreaterThanOrEqual(1)
    })

    test('continues generation after the client disconnects', async () => {
        const response = await app.request(`/api/v1/conversations/${conversationId}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reply',
                content: 'cancel the client stream but finish on the server',
                idempotencyKey: 'generation-disconnect-0001',
            }),
        })
        const generationId = response.headers.get('x-generation-id')!

        await response.body!.cancel('browser closed')
        await Bun.sleep(550)

        const run = context.store.generation.get(generationId)
        expect(run).toMatchObject({ status: 'complete', outputText: 'Hello from Ollama' })
        expect(context.store.message.get(run!.messageId!)).toMatchObject({
            content: 'Hello from Ollama',
            status: 'complete',
        })
        const debugHistory = (await (
            await app.request('/api/v1/debug/requests', { headers: { cookie } })
        ).json()) as { requests: Array<{ generationId: string; request: { body: unknown } }> }
        expect(debugHistory.requests[0]).toMatchObject({ generationId })
        expect(debugHistory.requests[0]?.request.body).toBeDefined()
    })

    test('reuses a trailing user message when an empty reply is requested', async () => {
        const created = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                characterId: GENERAL_CHAT_CHARACTER_ID,
                title: 'Empty reply reuse',
            }),
        })
        expect(created.status).toBe(201)
        const id = ((await created.json()) as { id: string }).id
        const userMessage = context.store.message.create(id, 'user', 'Use this again', 'complete')

        const response = await app.request(`/api/v1/conversations/${id}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reply',
                content: '',
                idempotencyKey: 'generation-empty-reuse-0001',
            }),
        })
        expect(response.status).toBe(200)
        await response.text()

        const messages = context.store.message.list(id)
        expect(messages.filter((message) => message.role === 'user')).toEqual([userMessage])
        expect(messages.at(-1)).toMatchObject({
            role: 'assistant',
            content: 'Hello from Ollama',
            status: 'complete',
        })

        const rejected = await app.request(`/api/v1/conversations/${id}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reply',
                content: '',
                idempotencyKey: 'generation-empty-reject-0001',
            }),
        })
        expect(rejected.status).toBe(422)
    })

    test('deletes one message or the selected message and everything after it', async () => {
        const created = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                characterId: GENERAL_CHAT_CHARACTER_ID,
                title: 'Message deletion scopes',
            }),
        })
        expect(created.status).toBe(201)
        const id = ((await created.json()) as { id: string }).id
        const first = context.store.message.create(id, 'user', 'first', 'complete')
        const second = context.store.message.create(id, 'assistant', 'second', 'complete')
        const third = context.store.message.create(id, 'user', 'third', 'complete')
        const fourth = context.store.message.create(id, 'assistant', 'fourth', 'complete')

        const only = await app.request(`/api/v1/conversations/${id}/messages/${second.id}`, {
            method: 'DELETE',
            headers: { cookie },
        })
        expect(only.status).toBe(204)
        expect(context.store.message.list(id).map((message) => message.id)).toEqual([
            first.id,
            third.id,
            fourth.id,
        ])

        const from = await app.request(`/api/v1/conversations/${id}/messages/${third.id}/from`, {
            method: 'DELETE',
            headers: { cookie },
        })
        expect(from.status).toBe(200)
        expect(await from.json()).toEqual({ deleted: 2 })
        expect(context.store.message.list(id).map((message) => message.id)).toEqual([first.id])
    })

    test('propagates cancellation and preserves partial assistant output', async () => {
        const response = await app.request(`/api/v1/conversations/${conversationId}/generations`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'reply',
                content: 'cancel this',
                idempotencyKey: 'generation-cancel-0001',
            }),
        })
        const generationId = response.headers.get('x-generation-id')!
        await Bun.sleep(20)
        const cancelled = await app.request(`/api/v1/generations/${generationId}`, {
            method: 'DELETE',
            headers: { cookie },
        })
        expect(cancelled.status).toBe(204)
        await response.text()
        const run = context.store.generation.get(generationId)
        expect(run?.status).toBe('cancelled')
        expect(run?.messageId).toBeTruthy()
        expect(context.store.message.get(run!.messageId!)).toMatchObject({
            content: 'Hello',
            status: 'cancelled',
        })
    })

    test('encrypts a Vertex API key and re-encrypts it after a password change', async () => {
        const login = await app.request('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: config.adminPassword }),
        })
        cookie = login.headers.get('set-cookie')!.split(';')[0]!

        const apiKey = 'test-vertex-api-key-that-must-never-be-plaintext'
        const configured = await app.request('/api/v1/provider', {
            method: 'PUT',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                provider: 'vertex',
                projectId: '',
                location: 'global',
                modelId: 'gemini-test',
                defaults: {},
                apiKey,
            }),
        })
        expect(configured.status).toBe(200)
        const providerBody = (await configured.json()) as Record<string, unknown>
        expect(providerBody).toMatchObject({ apiKeyConfigured: true, apiKeyLocked: false })
        expect(providerBody).not.toHaveProperty('apiKey')

        const stored = context.store.sqlite
            .query<
                { provider_json: string; provider_secret_json: string; secret_salt: string },
                []
            >(
                'SELECT provider_json, provider_secret_json, secret_salt FROM app_settings WHERE id = 1',
            )
            .get()!
        expect(stored.provider_json).not.toContain(apiKey)
        expect(stored.provider_secret_json).not.toContain(apiKey)
        expect(stored.provider_secret_json).toContain('AES-256-GCM')
        expect(stored.secret_salt.length).toBeGreaterThan(10)

        const newPassword = 'new correct horse battery staple'
        const changed = await app.request('/api/v1/auth/password', {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ currentPassword: config.adminPassword, newPassword }),
        })
        expect(changed.status).toBe(204)
        adminPassword = newPassword

        context.close()
        context = await createContext({ ...config, adminPassword: undefined })
        app = createApp(context)
        expect(context.providers.get()).toMatchObject({
            apiKeyConfigured: true,
            apiKeyLocked: true,
        })

        const relogin = await app.request('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: newPassword }),
        })
        expect(relogin.status).toBe(200)
        const runtime = await context.providers.requireRuntime()
        expect(runtime).toMatchObject({ provider: 'vertex', apiKey })
        expect(context.providers.get()).toMatchObject({
            apiKeyConfigured: true,
            apiKeyLocked: false,
        })

        const serviceAccount = {
            type: 'service_account',
            project_id: 'vertex-service-account-project',
            private_key_id: 'private-key-id',
            private_key:
                '-----BEGIN PRIVATE KEY-----\nnot-a-real-private-key\n-----END PRIVATE KEY-----\n',
            client_email: 'malang-test@vertex-service-account-project.iam.gserviceaccount.com',
            client_id: '123456789',
            token_uri: 'https://oauth2.googleapis.com/token',
        }
        const serviceAccountConfigured = await app.request('/api/v1/provider', {
            method: 'PUT',
            headers: {
                cookie: relogin.headers.get('set-cookie')!.split(';')[0]!,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                provider: 'vertex',
                projectId: '',
                location: 'us-central1',
                modelId: 'gemini-test',
                defaults: {},
                serviceAccountJson: JSON.stringify(serviceAccount),
            }),
        })
        expect(serviceAccountConfigured.status).toBe(200)
        expect((await serviceAccountConfigured.json()) as object).toMatchObject({
            credentialType: 'serviceAccount',
            projectId: serviceAccount.project_id,
            apiKeyConfigured: false,
            serviceAccountConfigured: true,
        })
        const serviceAccountStorage = context.store.sqlite
            .query<{ provider_json: string; provider_secret_json: string }, []>(
                'SELECT provider_json, provider_secret_json FROM app_settings WHERE id = 1',
            )
            .get()!
        expect(serviceAccountStorage.provider_json).not.toContain(serviceAccount.private_key)
        expect(serviceAccountStorage.provider_secret_json).not.toContain(serviceAccount.private_key)
        expect(serviceAccountStorage.provider_secret_json).not.toContain(
            serviceAccount.client_email,
        )
        expect(await context.providers.requireRuntime()).toMatchObject({
            provider: 'vertex',
            projectId: serviceAccount.project_id,
            serviceAccount,
        })
    })

    test('follows the global persona unless a conversation locks its selection', async () => {
        const relogin = await app.request('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: adminPassword }),
        })
        cookie = relogin.headers.get('set-cookie')!.split(';')[0]!
        const jsonHeaders = { cookie, 'content-type': 'application/json' }

        const personaCard = v3Card({ name: 'Persona Test Character' })
        const importedCharacter = await app.request('/api/v1/characters/import', {
            method: 'POST',
            headers: { ...jsonHeaders, 'x-filename': 'persona-test.json' },
            body: JSON.stringify(personaCard),
        })
        expect(importedCharacter.status).toBe(201)
        const personaCharacterId = (
            (await importedCharacter.json()) as { character: { id: string } }
        ).character.id

        const personaConversation = await app.request('/api/v1/conversations', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ characterId: personaCharacterId, title: 'Persona thread' }),
        })
        expect(personaConversation.status).toBe(201)
        const personaConversationId = ((await personaConversation.json()) as { id: string }).id

        async function createPersona(name: string, description: string) {
            const response = await app.request('/api/v1/personas', {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ name, description }),
            })
            expect(response.status).toBe(201)
            return (await response.json()) as { id: string; name: string }
        }

        async function preview() {
            const response = await app.request(
                `/api/v1/conversations/${personaConversationId}/prompt-preview`,
                { method: 'POST', headers: { cookie } },
            )
            expect(response.status).toBe(200)
            return (await response.json()) as {
                messages: Array<{ content: string }>
                persona?: { id: string | null; name: string; source: string }
            }
        }

        const personaA = await createPersona('Aria', 'Aria is an archivist.')
        const personaB = await createPersona('Bram', 'Bram is a blacksmith.')

        // Validation protects both the global setting and stored conversation bindings.
        const invalidSettings = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ selectedPersonaId: crypto.randomUUID() }),
        })
        expect(invalidSettings.status).toBe(422)
        const invalidBind = await app.request(`/api/v1/conversations/${personaConversationId}`, {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ boundPersonaId: crypto.randomUUID() }),
        })
        expect(invalidBind.status).toBe(404)

        // Global selection (A) is authoritative.
        const selectA = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ selectedPersonaId: personaA.id }),
        })
        expect(selectA.status).toBe(200)
        const previewA = await preview()
        expect(previewA.persona).toMatchObject({ id: personaA.id, source: 'global' })
        expect(
            previewA.messages.some((message) => message.content.includes('archivist')),
        ).toBeTrue()

        // Merely storing a conversation value does not override the global selection.
        const bindB = await app.request(`/api/v1/conversations/${personaConversationId}`, {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ boundPersonaId: personaB.id }),
        })
        expect(bindB.status).toBe(200)
        const previewAfterLegacyBind = await preview()
        expect(previewAfterLegacyBind.persona).toMatchObject({ id: personaA.id, source: 'global' })
        expect(
            previewAfterLegacyBind.messages.some((message) =>
                message.content.includes('archivist'),
            ),
        ).toBeTrue()

        // Locking activates the conversation value and keeps it independent from global changes.
        const lockPersona = await app.request(`/api/v1/conversations/${personaConversationId}`, {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ personaLocked: true }),
        })
        expect(lockPersona.status).toBe(200)
        const previewLocked = await preview()
        expect(previewLocked.persona).toMatchObject({ id: personaB.id, source: 'conversation' })
        expect(
            previewLocked.messages.some((message) => message.content.includes('blacksmith')),
        ).toBeTrue()

        const unlockPersona = await app.request(`/api/v1/conversations/${personaConversationId}`, {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ personaLocked: false }),
        })
        expect(unlockPersona.status).toBe(200)
        const previewAfterUnlock = await preview()
        expect(previewAfterUnlock.persona).toMatchObject({ id: personaA.id, source: 'global' })

        // Switching the one global value updates this existing conversation immediately.
        const selectB = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ selectedPersonaId: personaB.id }),
        })
        expect(selectB.status).toBe(200)
        const previewB = await preview()
        expect(previewB.persona).toMatchObject({ id: personaB.id, source: 'global' })
        expect(
            previewB.messages.some((message) => message.content.includes('blacksmith')),
        ).toBeTrue()

        const lockBeforeDelete = await app.request(
            `/api/v1/conversations/${personaConversationId}`,
            {
                method: 'PATCH',
                headers: jsonHeaders,
                body: JSON.stringify({ boundPersonaId: personaB.id, personaLocked: true }),
            },
        )
        expect(lockBeforeDelete.status).toBe(200)

        // Deleting a locked persona clears the reference and returns the conversation to global mode.
        const deleteB = await app.request(`/api/v1/personas/${personaB.id}`, {
            method: 'DELETE',
            headers: { cookie },
        })
        expect(deleteB.status).toBe(204)
        const afterDelete = await app.request(`/api/v1/conversations/${personaConversationId}`, {
            headers: { cookie },
        })
        expect(
            (await afterDelete.json()) as {
                boundPersonaId: string | null
                personaLocked: boolean
            },
        ).toMatchObject({ boundPersonaId: null, personaLocked: false })
        const previewAfterDelete = await preview()
        expect(previewAfterDelete.persona).toMatchObject({ id: null, source: 'default' })

        // Clearing the global selection uses the empty default identity.
        await app.request(`/api/v1/personas/${personaA.id}`, {
            method: 'DELETE',
            headers: { cookie },
        })
        const clearSelection = await app.request('/api/v1/settings', {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ selectedPersonaId: null }),
        })
        expect(clearSelection.status).toBe(200)
        const previewDefault = await preview()
        expect(previewDefault.persona).toMatchObject({ id: null, source: 'default' })
        expect(
            previewDefault.messages.some((message) => message.content.includes('archivist')),
        ).toBeFalse()
    })

    test('avatar upload/removal and CRUD round-trip for personas', async () => {
        const relogin = await app.request('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: adminPassword }),
        })
        cookie = relogin.headers.get('set-cookie')!.split(';')[0]!
        const created = await app.request('/api/v1/personas', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Avatar Persona', description: 'Has an avatar.' }),
        })
        expect(created.status).toBe(201)
        const persona = (await created.json()) as { id: string }

        const pngBytes = Uint8Array.from(
            atob(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            ),
            (char) => char.charCodeAt(0),
        )
        const form = new FormData()
        form.set('file', new Blob([pngBytes], { type: 'image/png' }), 'avatar.png')
        const avatarUpload = await app.request(`/api/v1/personas/${persona.id}/avatar`, {
            method: 'PUT',
            headers: { cookie },
            body: form,
        })
        expect(avatarUpload.status).toBe(200)
        const withAvatar = (await avatarUpload.json()) as { avatarAssetId: string | null }
        expect(withAvatar.avatarAssetId).not.toBeNull()

        const assetResponse = await app.request(`/api/v1/assets/${withAvatar.avatarAssetId}`, {
            headers: { cookie },
        })
        expect(assetResponse.status).toBe(200)
        expect(assetResponse.headers.get('content-type')).toBe('image/png')

        const avatarRemoved = await app.request(`/api/v1/personas/${persona.id}/avatar`, {
            method: 'DELETE',
            headers: { cookie },
        })
        expect(avatarRemoved.status).toBe(200)
        expect(
            ((await avatarRemoved.json()) as { avatarAssetId: string | null }).avatarAssetId,
        ).toBeNull()

        const updated = await app.request(`/api/v1/personas/${persona.id}`, {
            method: 'PATCH',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify({ note: 'Updated note.' }),
        })
        expect(updated.status).toBe(200)
        expect(((await updated.json()) as { note: string }).note).toBe('Updated note.')

        const deleted = await app.request(`/api/v1/personas/${persona.id}`, {
            method: 'DELETE',
            headers: { cookie },
        })
        expect(deleted.status).toBe(204)

        const missing = await app.request(`/api/v1/personas/${crypto.randomUUID()}`, {
            headers: { cookie },
        })
        expect(missing.status).toBe(404)
    })

    test('round-trips extended lorebook fields through character updates and CCv3 card export/import', async () => {
        const relogin = await app.request('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: adminPassword }),
        })
        cookie = relogin.headers.get('set-cookie')!.split(';')[0]!
        const jsonHeaders = { cookie, 'content-type': 'application/json' }

        const created = await app.request('/api/v1/characters', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ name: 'Lore Extension Test' }),
        })
        expect(created.status).toBe(201)
        const character = (await created.json()) as { id: string }

        const extendedEntry = {
            id: crypto.randomUUID(),
            keys: ['blade'],
            secondaryKeys: ['sharp'],
            content: 'A blade lore entry.',
            enabled: true,
            constant: false,
            selective: true,
            caseSensitive: true,
            useRegex: false,
            insertionOrder: 5,
            priority: 9,
            name: 'Blade lore',
            position: 'depth',
            depth: 3,
            role: 'user',
            scanDepth: 7,
            recursive: 'disabled',
            probability: 42,
            additionalKeys: ['sword'],
            excludeKeys: ['blunt'],
            fullWordMatching: true,
            decorators: {},
        }

        const patched = await app.request(`/api/v1/characters/${character.id}`, {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ lorebook: [extendedEntry] }),
        })
        expect(patched.status).toBe(200)

        function expectExtendedFields(entry: Record<string, unknown>) {
            expect(entry).toMatchObject({
                position: 'depth',
                depth: 3,
                role: 'user',
                scanDepth: 7,
                recursive: 'disabled',
                probability: 42,
                additionalKeys: ['sword'],
                excludeKeys: ['blunt'],
                fullWordMatching: true,
                insertionOrder: 5,
                priority: 9,
            })
        }

        // Fetching the character back reflects the extension fields (no migration needed — extensionsJson blob).
        const refetched = await app.request(`/api/v1/characters/${character.id}`, {
            headers: { cookie },
        })
        const refetchedBody = (await refetched.json()) as {
            lorebook: Array<Record<string, unknown>>
        }
        expectExtendedFields(refetchedBody.lorebook[0]!)

        // Export as CCv3 JSON, re-import as a new character, and confirm the same fields survive.
        const exported = await app.request(
            `/api/v1/characters/${character.id}/export?spec=v3&format=json`,
            { headers: { cookie } },
        )
        expect(exported.status).toBe(200)
        const cardText = await exported.text()

        const reimported = await app.request('/api/v1/characters/import', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json', 'x-filename': 'reimport.json' },
            body: cardText,
        })
        expect(reimported.status).toBe(201)
        const reimportedBody = (await reimported.json()) as {
            character: { lorebook: Array<Record<string, unknown>> }
        }
        expectExtendedFields(reimportedBody.character.lorebook[0]!)
    })

    test('round-trips a fully-populated lorebook entry through prompt module updates', async () => {
        const relogin = await app.request('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: adminPassword }),
        })
        cookie = relogin.headers.get('set-cookie')!.split(';')[0]!
        const jsonHeaders = { cookie, 'content-type': 'application/json' }

        const created = await app.request('/api/v1/prompt-modules', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({
                name: 'Lore Field Module',
                description: '',
                namespace: 'test.lore-fields',
                enabledByDefault: false,
                prompts: [],
                toggles: [],
                regexScripts: [],
                lorebook: [],
                assets: [],
            }),
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

        const updated = await app.request(`/api/v1/prompt-modules/${moduleRecord.id}`, {
            method: 'PUT',
            headers: jsonHeaders,
            body: JSON.stringify({
                name: 'Lore Field Module',
                description: '',
                namespace: 'test.lore-fields',
                enabledByDefault: false,
                prompts: [],
                toggles: [],
                regexScripts: [],
                lorebook: [fullEntry],
                assets: [],
            }),
        })
        expect(updated.status).toBe(200)

        const refetched = await app.request(`/api/v1/prompt-modules/${moduleRecord.id}`, {
            headers: { cookie },
        })
        const body = (await refetched.json()) as { lorebook: Array<Record<string, unknown>> }
        expect(body.lorebook[0]).toMatchObject(fullEntry)
    })
})

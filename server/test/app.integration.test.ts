import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GENERAL_CHAT_CHARACTER_ID, type ImportEvent } from '@malang/shared'
import { unzipSync, zipSync } from 'fflate'

import { createApp } from '@/app'
import { createContext } from '@/bootstrap'
import type { AppContext } from '@/context'

import { testConfig } from './helpers/app'
import { login } from './helpers/app'
import { charxArchive, v3Card } from './helpers/fixtures'

describe('Hono API and SQLite persistence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-api-'))
    const config = testConfig(directory, {
        allowedOrigins: new Set(['https://chat.example']),
    })
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
        cookie = await login(app, adminPassword)
    })

    afterAll(async () => {
        context.close()
        await ollama.stop(true)
        rmSync(directory, { recursive: true, force: true })
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
        // As in PocketRisu, the card system prompt never replaces the preset main prompt.
        expect(body.messages[0]!.content).not.toContain('Character wrapper:')
        expect(
            body.messages.some((message: { content: string }) =>
                message.content.startsWith('Final instruction:'),
            ),
        ).toBeTrue()
        expect(
            body.messages.some((message: { content: string }) =>
                message.content.includes('moon archive is restricted'),
            ),
        ).toBeTrue()
        expect(body.activatedLoreIds).toHaveLength(1)
    })

    test('imports a PocketRisu character package with chats and inlays', async () => {
        const encoder = new TextEncoder()
        const charx = zipSync({
            'card.json': encoder.encode(
                JSON.stringify(
                    v3Card({
                        name: 'Pocket package character',
                        first_mes: 'Package greeting',
                    }),
                ),
            ),
        })
        const packageBytes = zipSync({
            'manifest.json': encoder.encode(
                JSON.stringify({
                    type: 'risuCharacterPackage',
                    version: 1,
                    createdAt: new Date().toISOString(),
                    character: {
                        name: 'Pocket package character',
                        file: 'character/card.charx',
                    },
                    chats: { count: 1, file: 'chats/chats.json' },
                    inlays: {
                        count: 1,
                        metaFile: 'inlays/meta.json',
                        files: ['inlays/inlay-one.png'],
                    },
                }),
            ),
            'character/card.charx': charx,
            'chats/chats.json': encoder.encode(
                JSON.stringify({
                    type: 'risuAllChats',
                    ver: 2,
                    data: [
                        {
                            name: 'Imported chat',
                            note: 'Imported author note',
                            fmIndex: -1,
                            folderId: 'package-folder',
                            message: [
                                { role: 'user', data: 'Package question' },
                                { role: 'char', data: '{{inlay::inlay-one}}' },
                            ],
                        },
                    ],
                    folders: [{ id: 'package-folder', name: 'Package chats', folded: false }],
                }),
            ),
            'inlays/inlay-one.png': new Uint8Array([137, 80, 78, 71]),
            'inlays/meta.json': encoder.encode('{}'),
        })
        const response = await app.request('/api/v1/characters/import-package', {
            method: 'POST',
            headers: {
                cookie,
                'content-type': 'application/zip',
                'x-filename': 'aria_package.zip',
            },
            body: packageBytes,
        })

        expect(response.status).toBe(201)
        const body = (await response.json()) as {
            character: { id: string; name: string }
            conversations: Array<{ id: string; title: string; authorNote: string }>
            conversationGroups: Array<{ id: string; name: string }>
        }
        expect(body.character.name).toBe('Pocket package character')
        expect(body.conversations[0]).toMatchObject({
            title: 'Imported chat',
            authorNote: 'Imported author note',
        })
        expect(body.conversationGroups).toHaveLength(1)
        expect(body.conversationGroups[0]!.name).toBe('Package chats')
        expect(context.store.conversation.get(body.conversations[0]!.id)?.groupId).toBe(
            body.conversationGroups[0]!.id,
        )
        expect(
            context.store.message.list(body.conversations[0]!.id).map((item) => item.content),
        ).toEqual(['Package greeting', 'Package question', '{{inlay::inlay-one}}'])
        expect(context.characters.assets(body.character.id)).toContainEqual(
            expect.objectContaining({
                name: 'inlay-one',
                type: 'inlay',
                sourceUri: 'inlay:inlay-one',
            }),
        )

        const exported = await app.request(
            `/api/v1/characters/${body.character.id}/export-package`,
            { headers: { cookie } },
        )
        expect(exported.status).toBe(200)
        expect(exported.headers.get('content-disposition')).toContain('-package.zip')
        const exportedArchive = unzipSync(new Uint8Array(await exported.arrayBuffer()))
        expect(exportedArchive['manifest.json']).toBeDefined()
        expect(exportedArchive['chats/chats.json']).toBeDefined()
        expect(Object.keys(exportedArchive)).toContain('inlays/inlay-one.png')
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

    test('imports a raw CHARX body with a URI-encoded filename', async () => {
        const imported = await app.request('/api/v1/characters/import', {
            method: 'POST',
            headers: {
                cookie,
                'content-type': 'application/octet-stream',
                'x-filename': encodeURIComponent('테스트 캐릭터.charx'),
            },
            body: charxArchive(),
        })
        expect(imported.status).toBe(201)
    })

    test('imports CHARX asset links and lorebooks beyond SQLite bound-parameter limits', async () => {
        const assetCount = 1500
        const loreCount = 5000
        const files: Record<string, Uint8Array> = {}
        const assets = []
        for (let index = 0; index < assetCount; index += 1) {
            files[`x_meta/a${index}.json`] = new TextEncoder().encode('{}')
            files[`assets/other/image/a${index}.webp`] = new Uint8Array([index % 256, index >> 8])
            assets.push({
                type: 'x-risu-asset',
                uri: `embeded://assets/other/image/a${index}.webp`,
                name: `a${index}`,
                ext: 'webp',
            })
        }
        const card = v3Card({
            name: 'Many assets',
            assets,
            character_book: {
                extensions: {},
                entries: Array.from({ length: loreCount }, (_, index) => ({
                    keys: [`key${index}`],
                    secondary_keys: [],
                    content: `entry ${index}`,
                    enabled: true,
                    insertion_order: index,
                    case_sensitive: false,
                    use_regex: false,
                    constant: false,
                    selective: false,
                    priority: 0,
                    name: `entry ${index}`,
                    comment: '',
                    extensions: {},
                })),
            },
        })
        files['card.json'] = new TextEncoder().encode(JSON.stringify(card))

        const imported = await app.request('/api/v1/characters/import', {
            method: 'POST',
            headers: {
                cookie,
                'content-type': 'application/octet-stream',
                'x-filename': 'many.charx',
            },
            body: zipSync(files, { level: 0 }),
        })
        expect(imported.status).toBe(201)
        const { character } = (await imported.json()) as {
            character: { id: string; lorebook: unknown[] }
        }
        expect(character.lorebook).toHaveLength(loreCount)
        const linked = await app.request(`/api/v1/characters/${character.id}/assets`, {
            headers: { cookie },
        })
        expect(((await linked.json()) as { assets: unknown[] }).assets).toHaveLength(assetCount)
    })

    test('streams CHARX import progress and removes the spooled upload', async () => {
        const readEvents = async (response: Response) =>
            (await response.text())
                .split('\n\n')
                .filter(Boolean)
                .map((block) => JSON.parse(block.replace(/^data: /, '')) as ImportEvent)
        const uploadsDirectory = join(directory, 'tmp', 'uploads')
        const upload = (body: string | Uint8Array, filename: string) =>
            app.request('/api/v1/characters/import', {
                method: 'POST',
                headers: {
                    cookie,
                    accept: 'text/event-stream',
                    'content-type': 'application/octet-stream',
                    'x-filename': filename,
                },
                body,
            })

        const response = await upload(charxArchive(), 'stream.charx')
        expect(response.headers.get('content-type')).toContain('text/event-stream')
        const events = await readEvents(response)
        expect(events[0]).toEqual({ type: 'import.progress', stage: 'reading' })
        const assetEvents = events.filter(
            (event) => event.type === 'import.progress' && event.stage === 'assets',
        )
        const total = (assetEvents[0] as { total: number }).total
        expect(total).toBeGreaterThan(0)
        expect(assetEvents.map((event) => (event as { done: number }).done)).toEqual(
            Array.from({ length: total + 1 }, (_, index) => index),
        )
        const completed = events.at(-1) as Extract<ImportEvent, { type: 'import.completed' }>
        expect(completed).toMatchObject({ type: 'import.completed', status: 201 })
        expect((completed.result as { character: { id: string } }).character.id).toBeString()
        expect(readdirSync(uploadsDirectory)).toEqual([])

        const failed = await readEvents(await upload('not a zip', 'broken.charx'))
        expect(failed.at(-1)).toMatchObject({
            type: 'import.failed',
            status: 422,
            error: { message: 'Invalid CHARX archive' },
        })
        expect(readdirSync(uploadsDirectory)).toEqual([])
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

    test('round-trips extended lorebook fields through character updates and CCv3 card export/import', async () => {
        cookie = await login(app, adminPassword)
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

        const refetched = await app.request(`/api/v1/characters/${character.id}`, {
            headers: { cookie },
        })
        const refetchedBody = (await refetched.json()) as {
            lorebook: Array<Record<string, unknown>>
        }
        expectExtendedFields(refetchedBody.lorebook[0]!)

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

    test('round-trips character bias through risuai.bias in card export/import', async () => {
        cookie = await login(app, adminPassword)
        const jsonHeaders = { cookie, 'content-type': 'application/json' }
        const created = await app.request('/api/v1/characters', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ name: 'Bias Test', bias: [['{{user}}', -101]] }),
        })
        const character = (await created.json()) as { id: string; bias: unknown }
        expect(character.bias).toEqual([['{{user}}', -101]])

        const patched = await app.request(`/api/v1/characters/${character.id}`, {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ bias: [['dragon', 30]] }),
        })
        expect(((await patched.json()) as { bias: unknown }).bias).toEqual([['dragon', 30]])

        const exported = await app.request(
            `/api/v1/characters/${character.id}/export?spec=v3&format=json`,
            { headers: { cookie } },
        )
        const cardText = await exported.text()
        const card = JSON.parse(cardText) as {
            data: { extensions: { risuai: { bias: unknown } } }
        }
        expect(card.data.extensions.risuai.bias).toEqual([['dragon', 30]])

        const reimported = await app.request('/api/v1/characters/import', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json', 'x-filename': 'bias.json' },
            body: cardText,
        })
        const reimportedBody = (await reimported.json()) as { character: { bias: unknown } }
        expect(reimportedBody.character.bias).toEqual([['dragon', 30]])
    })
})

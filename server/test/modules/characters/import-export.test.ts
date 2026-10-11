import { afterAll, describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { ImportEvent } from '@malang/shared'
import { unzipSync, zipSync } from 'fflate'

import { createTestApp } from '../../helpers/app'
import { charxArchive, v3Card } from '../../helpers/fixtures'

const t = await createTestApp()
afterAll(() => t.close())

describe('character import and export', () => {
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
        const response = await t.send('/characters/import-package', {
            method: 'POST',
            headers: { 'content-type': 'application/zip', 'x-filename': 'aria_package.zip' },
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
        expect(t.context.store.conversation.get(body.conversations[0]!.id)?.groupId).toBe(
            body.conversationGroups[0]!.id,
        )
        expect(
            t.context.store.message.list(body.conversations[0]!.id).map((item) => item.content),
        ).toEqual(['Package greeting', 'Package question', '{{inlay::inlay-one}}'])
        expect(t.context.characters.assets(body.character.id)).toContainEqual(
            expect.objectContaining({
                name: 'inlay-one',
                type: 'inlay',
                sourceUri: 'inlay:inlay-one',
            }),
        )

        const exported = await t.send(`/characters/${body.character.id}/export-package`)
        expect(exported.status).toBe(200)
        expect(exported.headers.get('content-disposition')).toContain('-package.zip')
        const exportedArchive = unzipSync(new Uint8Array(await exported.arrayBuffer()))
        expect(exportedArchive['manifest.json']).toBeDefined()
        expect(exportedArchive['chats/chats.json']).toBeDefined()
        expect(Object.keys(exportedArchive)).toContain('inlays/inlay-one.png')
    })

    test('imports a raw CHARX body with a URI-encoded filename', async () => {
        const imported = await t.send('/characters/import', {
            method: 'POST',
            headers: {
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

        const imported = await t.send('/characters/import', {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'x-filename': 'many.charx' },
            body: zipSync(files, { level: 0 }),
        })
        expect(imported.status).toBe(201)
        const { character } = (await imported.json()) as {
            character: { id: string; lorebook: unknown[] }
        }
        expect(character.lorebook).toHaveLength(loreCount)
        const linked = await t.send(`/characters/${character.id}/assets`)
        expect(((await linked.json()) as { assets: unknown[] }).assets).toHaveLength(assetCount)
    })

    test('streams CHARX import progress and removes the spooled upload', async () => {
        const readEvents = async (response: Response) =>
            (await response.text())
                .split('\n\n')
                .filter(Boolean)
                .map((block) => JSON.parse(block.replace(/^data: /, '')) as ImportEvent)
        const uploadsDirectory = join(t.dataDir, 'tmp', 'uploads')
        const upload = (body: string | Uint8Array, filename: string) =>
            t.send('/characters/import', {
                method: 'POST',
                headers: {
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

    test('round-trips extended lorebook fields through character updates and CCv3 card export/import', async () => {
        const created = await t.send('/characters', {
            method: 'POST',
            body: { name: 'Lore Extension Test' },
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

        const patched = await t.send(`/characters/${character.id}`, {
            method: 'PATCH',
            body: { lorebook: [extendedEntry] },
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

        const refetched = await t.send(`/characters/${character.id}`)
        const refetchedBody = (await refetched.json()) as {
            lorebook: Array<Record<string, unknown>>
        }
        expectExtendedFields(refetchedBody.lorebook[0]!)

        const exported = await t.send(`/characters/${character.id}/export?spec=v3&format=json`)
        expect(exported.status).toBe(200)
        const cardText = await exported.text()

        const reimported = await t.send('/characters/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-filename': 'reimport.json' },
            body: cardText,
        })
        expect(reimported.status).toBe(201)
        const reimportedBody = (await reimported.json()) as {
            character: { lorebook: Array<Record<string, unknown>> }
        }
        expectExtendedFields(reimportedBody.character.lorebook[0]!)
    })

    test('round-trips character bias through risuai.bias in card export/import', async () => {
        const created = await t.send('/characters', {
            method: 'POST',
            body: { name: 'Bias Test', bias: [['{{user}}', -101]] },
        })
        const character = (await created.json()) as { id: string; bias: unknown }
        expect(character.bias).toEqual([['{{user}}', -101]])

        const patched = await t.send(`/characters/${character.id}`, {
            method: 'PATCH',
            body: { bias: [['dragon', 30]] },
        })
        expect(((await patched.json()) as { bias: unknown }).bias).toEqual([['dragon', 30]])

        const exported = await t.send(`/characters/${character.id}/export?spec=v3&format=json`)
        const cardText = await exported.text()
        const card = JSON.parse(cardText) as {
            data: { extensions: { risuai: { bias: unknown } } }
        }
        expect(card.data.extensions.risuai.bias).toEqual([['dragon', 30]])

        const reimported = await t.send('/characters/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-filename': 'bias.json' },
            body: cardText,
        })
        const reimportedBody = (await reimported.json()) as { character: { bias: unknown } }
        expect(reimportedBody.character.bias).toEqual([['dragon', 30]])
    })
})

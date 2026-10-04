import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import type { CharacterCardV3 } from '@risuai/ccardlib'
import { unzipSync, zipSync } from 'fflate'

import { exportCharacterCard, importCharacterCard } from '../src/services/app/character-card'
import { exportPromptModule } from '../src/services/prompt/module-codec'
import { encodeRPack } from '../src/services/prompt/rpack'
import { appConfig, v3Card } from './fixtures'

function buildRisumModule(module: Record<string, unknown>): Uint8Array {
    const main = encodeRPack(
        new TextEncoder().encode(JSON.stringify({ module, type: 'risuModule' })),
    )
    const output = new Uint8Array(7 + main.length)
    output[0] = 111
    output[1] = 0
    new DataView(output.buffer).setUint32(2, main.length, true)
    output.set(main, 6)
    output[6 + main.length] = 0
    return output
}

const config = appConfig()

describe('character card codec', () => {
    test('imports v3 JSON and preserves extensions and lore', async () => {
        const value = await importCharacterCard(
            new TextEncoder().encode(JSON.stringify(v3Card())),
            'aria.json',
            config,
        )
        expect(value.sourceSpec).toBe('v3')
        expect(value.card.data.extensions).toMatchObject({ malang_test: true })
        expect(value.card.data.character_book?.entries).toHaveLength(1)
    })

    test('exports v3 PNG with both v3 and v2 metadata', async () => {
        const imported = await importCharacterCard(
            new TextEncoder().encode(JSON.stringify(v3Card())),
            'aria.json',
            config,
        )
        const png = exportCharacterCard({ card: imported.card, assets: [] }, 'v3', 'png')
        const reread = await importCharacterCard(png.bytes, 'aria.png', config)
        expect(reread.card.data.name).toBe('Aria')
        expect(reread.sourceSpec).toBe('v3')
    })

    test('exports and imports CHARX', async () => {
        const imported = await importCharacterCard(
            new TextEncoder().encode(JSON.stringify(v3Card())),
            'aria.json',
            config,
        )
        const charx = exportCharacterCard({ card: imported.card, assets: [] }, 'v3', 'charx')
        const reread = await importCharacterCard(charx.bytes, 'aria.charx', config)
        expect(reread.card.data.name).toBe('Aria')
    })

    test('round-trips PocketRisu lorebook folders through the CHARX module sidecar', async () => {
        const folderId = crypto.randomUUID()
        const groupId = crypto.randomUUID()
        const entryId = crypto.randomUUID()
        const risuModule = exportPromptModule(
            {
                name: 'Aria Module',
                description: 'Lorebook for Aria',
                namespace: '',
                sourceId: crypto.randomUUID(),
                enabledByDefault: false,
                prompts: [],
                toggles: [],
                lorebook: [
                    {
                        id: folderId,
                        keys: [],
                        secondaryKeys: [],
                        content: '',
                        enabled: false,
                        constant: false,
                        selective: false,
                        caseSensitive: false,
                        useRegex: false,
                        insertionOrder: 0,
                        priority: 0,
                        name: 'Places',
                        group: groupId,
                        isGroup: true,
                    },
                    {
                        id: entryId,
                        keys: ['capital'],
                        secondaryKeys: [],
                        content: 'The capital is built around an old observatory.',
                        enabled: true,
                        constant: false,
                        selective: false,
                        caseSensitive: false,
                        useRegex: false,
                        insertionOrder: 1,
                        priority: 1,
                        name: 'Capital',
                        group: groupId,
                    },
                ],
            },
            'risum',
        )
        const charx = exportCharacterCard(
            {
                card: v3Card({ character_book: undefined }) as CharacterCardV3,
                assets: [],
                risuModule,
            },
            'v3',
            'charx',
        )
        expect(unzipSync(charx.bytes)['module.risum']).toBeDefined()

        const reread = await importCharacterCard(charx.bytes, 'aria.charx', config)
        const entries = reread.card.data.character_book?.entries || []
        const folder = entries.find((entry) => entry.comment === 'Places')
        const capital = entries.find((entry) => entry.comment === 'Capital')
        expect(folder?.extensions?.malang_is_group).toBe(true)
        expect(capital?.extensions?.malang_group).toBe(folder?.extensions?.malang_group)
    })

    test('imports the Devil-chan CHARX compatibility fixture', async () => {
        const imported = await importCharacterCard(
            readFileSync(new URL('./test.charx', import.meta.url)),
            'test.charx',
            config,
        )
        expect(imported.sourceSpec).toBe('v3')
        expect(imported.card.data.name).toBe('Devil-chan')
        expect(imported.card.data.character_book?.entries || []).toHaveLength(0)
        expect(imported.assets).toHaveLength(140)
        expect(imported.card.data.extensions).toHaveProperty('risuai')
    })

    test('imports the lorebook from a RisuAI module.risum sidecar, including folder groups', async () => {
        const card = v3Card({ character_book: undefined })
        const risumModule = buildRisumModule({
            lorebook: [
                {
                    id: 'folder-1',
                    // RisuAI's addLorebookFolder() repurposes `key` as the folder's identity,
                    // prefixed with a private-use-area sentinel character.
                    key: 'folder:folder-1',
                    secondkey: '',
                    insertorder: 0,
                    comment: 'Weather lore',
                    content: '',
                    mode: 'folder',
                    alwaysActive: false,
                    selective: false,
                },
                {
                    id: 'entry-1',
                    key: 'rain, storm',
                    secondkey: '',
                    insertorder: 10,
                    comment: 'Rainy season',
                    content: 'It rains constantly in the capital.',
                    mode: 'normal',
                    alwaysActive: false,
                    selective: false,
                    useRegex: false,
                    // Children reference the folder by its `key`, not its `id`.
                    folder: 'folder:folder-1',
                },
                {
                    id: 'entry-2',
                    key: 'sun',
                    secondkey: '',
                    insertorder: 20,
                    comment: 'Sunny plains',
                    content: 'The plains are always sunny.',
                    mode: 'normal',
                    alwaysActive: true,
                    selective: false,
                },
            ],
            regex: [
                {
                    id: 'regex-1',
                    comment: 'Strip asterisks',
                    in: '\\*',
                    out: '',
                    type: 'editoutput',
                },
            ],
        })
        const archive = zipSync({
            'card.json': new TextEncoder().encode(JSON.stringify(card)),
            'module.risum': risumModule,
        })
        const imported = await importCharacterCard(archive, 'risu-export.charx', config)
        const entries = imported.card.data.character_book?.entries || []
        expect(entries).toHaveLength(3)

        const folder = entries.find((entry) => entry.comment === 'Weather lore')
        const rainy = entries.find((entry) => entry.comment === 'Rainy season')
        const sunny = entries.find((entry) => entry.comment === 'Sunny plains')
        expect(folder?.extensions?.malang_is_group).toBe(true)
        expect(rainy?.extensions?.malang_is_group).toBeFalsy()
        expect(rainy?.extensions?.malang_group).toBe(folder?.extensions?.malang_group)
        expect(rainy?.keys).toEqual(['rain', 'storm'])
        expect(sunny?.constant).toBe(true)
        expect(sunny?.extensions?.malang_group).toBeUndefined()

        const risuai = imported.card.data.extensions?.risuai as Record<string, unknown>
        expect(risuai.customScripts).toHaveLength(1)
    })

    test('normalizes common CHARX directory, dot, and Windows paths', async () => {
        const card = v3Card({
            assets: [
                {
                    type: 'icon',
                    name: 'main',
                    ext: 'png',
                    uri: 'embeded://assets/icon.png',
                },
            ],
        })
        const archive = zipSync({
            'assets/': new Uint8Array(),
            './card.json': new TextEncoder().encode(JSON.stringify(card)),
            'assets\\icon.png': new Uint8Array([137, 80, 78, 71]),
        })
        const imported = await importCharacterCard(archive, 'compatible.charx', config)
        expect(imported.card.data.name).toBe('Aria')
        expect(imported.assets).toHaveLength(1)
        expect(imported.avatar?.name).toBe('main')
    })

    test('still rejects parent traversal and normalized duplicate paths', async () => {
        const card = new TextEncoder().encode(JSON.stringify(v3Card()))
        expect(
            importCharacterCard(
                zipSync({ 'card.json': card, '../outside.png': new Uint8Array([1]) }),
                'unsafe.charx',
                config,
            ),
        ).rejects.toThrow('Unsafe CHARX path')
        expect(
            importCharacterCard(
                zipSync({ 'card.json': card, './card.json': card }),
                'duplicate.charx',
                config,
            ),
        ).rejects.toThrow('Duplicate CHARX path')
    })
})

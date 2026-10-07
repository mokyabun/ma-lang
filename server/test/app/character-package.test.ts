import { describe, expect, test } from 'bun:test'

import type { CharacterCardV3 } from '@risuai/ccardlib'
import { zipSync } from 'fflate'
import * as textChunk from 'png-chunk-text'
import encodeChunks from 'png-chunks-encode'
import extractChunks from 'png-chunks-extract'

import { exportCharacterCard } from '@/services/app/character-card'
import {
    CharacterPackageFormatError,
    exportPocketRisuCharacterPackage,
    importPocketRisuCharacterPackage,
} from '@/services/app/character-package'

import { appConfig, v3Card } from '../support/fixtures'

const config = appConfig()

const encoder = new TextEncoder()
const emptyPng = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
    ),
)

function personaPng() {
    const chunks = extractChunks(emptyPng)
    const end = chunks.findIndex((chunk) => chunk.name === 'IEND')
    chunks.splice(
        end,
        0,
        textChunk.encode(
            'persona',
            Buffer.from(
                JSON.stringify({ name: 'Mina', personaPrompt: 'An explorer', note: 'Imported' }),
            ).toString('base64'),
        ),
    )
    return encodeChunks(chunks)
}

describe('PocketRisu character package codec', () => {
    test('exports an importable PocketRisu package', () => {
        const card = v3Card({ name: 'Round trip' }) as CharacterCardV3
        const charx = exportCharacterCard({ card, assets: [] }, 'v3', 'charx').bytes
        const archive = exportPocketRisuCharacterPackage({
            characterName: 'Round trip',
            characterCard: charx,
            chats: [
                {
                    id: 'chat-id',
                    name: 'A saved chat',
                    note: 'Keep this note',
                    fmIndex: -1,
                    firstMessageDisabled: false,
                    folderId: 'folder-id',
                    bindedPersona: 'persona-id',
                    scriptstate: { chapter: '2' },
                    messages: [{ role: 'user', content: 'Continue' }],
                },
            ],
            chatGroups: [{ id: 'folder-id', name: 'Favorites' }],
            personas: [
                {
                    id: 'persona-id',
                    name: 'Mina',
                    description: 'An explorer',
                    note: 'Imported',
                    avatar: emptyPng,
                },
            ],
            inlays: [
                {
                    id: 'picture-id',
                    bytes: emptyPng,
                    extension: 'png',
                    mimeType: 'image/png',
                },
            ],
        })

        const result = importPocketRisuCharacterPackage(archive, config)
        expect(result.characterName).toBe('Round trip')
        expect(result.chats[0]).toMatchObject({
            title: 'A saved chat',
            folderId: 'folder-id',
            boundPersonaId: 'persona-id',
            messages: [{ role: 'user', content: 'Continue' }],
        })
        expect(result.chatGroups[0]?.name).toBe('Favorites')
        expect(result.personas[0]).toMatchObject({ name: 'Mina', description: 'An explorer' })
        expect(result.inlays[0]?.id).toBe('picture-id')
    })

    test('reads its character, chats, personas, and inlays', () => {
        const card = v3Card({ name: 'Package Aria' }) as CharacterCardV3
        const charx = exportCharacterCard({ card, assets: [] }, 'v3', 'charx').bytes
        const archive = zipSync({
            'manifest.json': encoder.encode(
                JSON.stringify({
                    type: 'risuCharacterPackage',
                    version: 1,
                    createdAt: new Date().toISOString(),
                    character: { name: 'Package Aria', file: 'character/aria.charx' },
                    chats: { count: 1, file: 'chats/chats.json' },
                    personas: [
                        {
                            name: 'Mina',
                            originalId: 'persona-old',
                            file: 'persona/mina.png',
                        },
                    ],
                    inlays: {
                        count: 1,
                        metaFile: 'inlays/meta.json',
                        files: ['inlays/picture-id.png'],
                    },
                }),
            ),
            'character/aria.charx': charx,
            'chats/chats.json': encoder.encode(
                JSON.stringify({
                    type: 'risuAllChats',
                    ver: 2,
                    data: [
                        {
                            name: 'Old adventure',
                            note: 'Remember the map',
                            fmIndex: -1,
                            bindedPersona: 'persona-old',
                            folderId: 'folder-old',
                            scriptstate: { $chapter: 3 },
                            message: [
                                { role: 'user', data: 'Hello' },
                                { role: 'char', data: 'Welcome back' },
                            ],
                        },
                    ],
                    folders: [{ id: 'folder-old', name: 'Completed routes', folded: false }],
                }),
            ),
            'persona/mina.png': personaPng(),
            'inlays/picture-id.png': emptyPng,
            'inlays/meta.json': encoder.encode('{}'),
        })

        const result = importPocketRisuCharacterPackage(archive, config)

        expect(result.characterFile?.filename).toBe('aria.charx')
        expect(result.chats[0]).toMatchObject({
            title: 'Old adventure',
            authorNote: 'Remember the map',
            variables: { $chapter: '3' },
            boundPersonaId: 'persona-old',
            folderId: 'folder-old',
            messages: [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Welcome back' },
            ],
        })
        expect(result.chatGroups).toEqual([{ originalId: 'folder-old', name: 'Completed routes' }])
        expect(result.personas[0]).toMatchObject({
            name: 'Mina',
            description: 'An explorer',
            note: 'Imported',
        })
        expect(result.inlays[0]).toMatchObject({ id: 'picture-id', mimeType: 'image/png' })
    })

    test('rejects non-package and unsafe archives', () => {
        expect(() =>
            importPocketRisuCharacterPackage(
                zipSync({ 'other.json': new Uint8Array([1]) }),
                config,
            ),
        ).toThrow(CharacterPackageFormatError)
        const unsafe = zipSync({
            'manifest.json': encoder.encode(
                JSON.stringify({
                    type: 'risuCharacterPackage',
                    version: 1,
                    character: { name: 'Unsafe', file: '../card.charx' },
                }),
            ),
        })
        expect(() => importPocketRisuCharacterPackage(unsafe, config)).toThrow(
            CharacterPackageFormatError,
        )
    })
})

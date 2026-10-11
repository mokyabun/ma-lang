import { describe, expect, spyOn, test } from 'bun:test'

import type { Character } from '@malang/shared'
import {
    makeAsset,
    makeCharacter,
    makeConversation,
    makePersona,
    testId,
} from '@test/helpers/fixtures'
import { createStore } from 'jotai'

import type { AppLoading } from '@/components/dialogs/atom'
import { loadingAtom } from '@/components/dialogs/atom'
import {
    archiveCharacterAtom,
    characterAssetsAtom,
    characterCreatingAtom,
    characterSavingAtom,
    createCharacterAtom,
    deleteCharacterAtom,
    importCharacterAtom,
    importCharacterPackageAtom,
    removeCharacterAvatarAtom,
    restoreCharacterAtom,
    saveCharacterAtom,
    uploadCharacterAvatarAtom,
} from '@/features/characters/atom'
import { personaListAtom } from '@/features/personas/atom'
import { api } from '@/lib/api'
import {
    charactersAtom,
    conversationGroupsAtom,
    conversationsAtom,
    mobileSidebarOpenAtom,
    selectedCharacterIdAtom,
    selectedConversationIdAtom,
    workspaceErrorAtom,
} from '@/lib/store'

const aria = makeCharacter({ id: testId(10), name: 'Aria' })
const mina = makeCharacter({ id: testId(11), name: 'Mina' })
const file = new File([new Uint8Array(2_048)], 'aria.charx')

function storeWith(characters: Character[], selected: string | null = aria.id) {
    const store = createStore()
    store.set(charactersAtom, characters)
    store.set(selectedCharacterIdAtom, selected)
    return store
}

function recordLoading(store: ReturnType<typeof createStore>) {
    const states: Array<AppLoading | null> = []
    store.sub(loadingAtom, () => states.push(store.get(loadingAtom)))
    return states
}

describe('character commands', () => {
    test('creates a blank character, selects it and runs one creation at a time', async () => {
        const store = storeWith([aria], null)
        store.set(selectedConversationIdAtom, testId(100))
        const pending = Promise.withResolvers<Character>()
        const create = spyOn(api, 'createCharacter').mockReturnValue(pending.promise)

        const creating = store.set(createCharacterAtom)
        expect(await store.set(createCharacterAtom)).toBeNull()
        pending.resolve(mina)

        expect(await creating).toBe(mina)
        expect(create).toHaveBeenCalledTimes(1)
        expect(create.mock.calls[0]![0]).toMatchObject({ name: '새 캐릭터', lorebook: [] })
        expect(store.get(charactersAtom)).toEqual([mina, aria])
        expect(store.get(selectedCharacterIdAtom)).toBe(mina.id)
        expect(store.get(selectedConversationIdAtom)).toBeNull()
        expect(store.get(characterCreatingAtom)).toBe(false)
    })

    test('saves the selected character and rethrows a failed save', async () => {
        const store = storeWith([aria, mina])
        const renamed = { ...aria, name: 'Aria Park' }
        const update = spyOn(api, 'updateCharacter').mockResolvedValueOnce(renamed)

        expect(await store.set(saveCharacterAtom, { name: 'Aria Park' })).toBe(renamed)
        expect(update).toHaveBeenCalledWith(aria.id, { name: 'Aria Park' })
        expect(store.get(charactersAtom)).toEqual([renamed, mina])

        update.mockRejectedValueOnce(new Error('too long'))
        const failure = await store
            .set(saveCharacterAtom, { name: 'x' })
            .catch((cause: unknown) => cause)
        expect(failure).toMatchObject({ message: 'too long' })
        expect(store.get(workspaceErrorAtom)).toBe('too long')
        expect(store.get(characterSavingAtom)).toBe(false)
    })

    test('does nothing without a selected character', async () => {
        const store = storeWith([aria], null)
        const update = spyOn(api, 'updateCharacter')
        const upload = spyOn(api, 'uploadAvatar')
        expect(await store.set(saveCharacterAtom, { name: 'x' })).toBeNull()
        expect(await store.set(uploadCharacterAvatarAtom, file)).toBeNull()
        expect(await store.set(removeCharacterAvatarAtom)).toBeNull()
        expect(update).not.toHaveBeenCalled()
        expect(upload).not.toHaveBeenCalled()
    })

    test('uploads and removes the avatar of the selected character', async () => {
        const store = storeWith([aria])
        const withAvatar = { ...aria, avatarAssetId: testId(400) }
        spyOn(api, 'uploadAvatar').mockResolvedValue(withAvatar)
        spyOn(api, 'characterAssets').mockResolvedValue({ assets: [makeAsset()] })
        spyOn(api, 'removeAvatar').mockResolvedValue(aria)

        await store.set(uploadCharacterAvatarAtom, file)
        expect(store.get(charactersAtom)).toEqual([withAvatar])
        expect(store.get(characterAssetsAtom)).toEqual([makeAsset()])

        await store.set(removeCharacterAvatarAtom)
        expect(store.get(charactersAtom)).toEqual([aria])
    })

    test('archives and restores a character', async () => {
        const store = storeWith([aria])
        spyOn(api, 'archiveCharacter').mockResolvedValue(undefined)
        spyOn(api, 'restoreCharacter').mockResolvedValue(aria)

        expect(await store.set(archiveCharacterAtom, aria.id)).toBe(true)
        expect(store.get(charactersAtom)[0]!.archivedAt).toEqual(expect.any(String))

        expect(await store.set(restoreCharacterAtom, aria.id)).toBe(aria)
        expect(store.get(charactersAtom)[0]!.archivedAt).toBeNull()
    })

    test('reports a failed archive or restore', async () => {
        const store = storeWith([aria])
        spyOn(api, 'archiveCharacter').mockRejectedValue(new Error('gone'))
        spyOn(api, 'restoreCharacter').mockRejectedValue(new Error('still gone'))

        expect(await store.set(archiveCharacterAtom, aria.id)).toBe(false)
        expect(store.get(workspaceErrorAtom)).toBe('gone')
        expect(await store.set(restoreCharacterAtom, aria.id)).toBeNull()
        expect(store.get(workspaceErrorAtom)).toBe('still gone')
        expect(store.get(charactersAtom)).toEqual([aria])
    })
})

describe('deleting a character', () => {
    test('removes its conversations and selects the next active character', async () => {
        const archived = makeCharacter({ id: testId(12), archivedAt: '2026-01-02T00:00:00.000Z' })
        const store = storeWith([aria, archived, mina])
        store.set(characterAssetsAtom, [makeAsset()])
        const minaChat = makeConversation({ id: testId(102), characterId: mina.id })
        store.set(conversationsAtom, [
            makeConversation({ id: testId(100), characterId: aria.id }),
            makeConversation({
                id: testId(101),
                characterId: mina.id,
                archivedAt: '2026-01-02T00:00:00.000Z',
            }),
            minaChat,
        ])
        spyOn(api, 'deleteCharacter').mockResolvedValue(undefined)

        const result = await store.set(deleteCharacterAtom, aria.id)

        expect(result).toEqual({
            ok: true,
            wasSelected: true,
            nextCharacter: mina,
            nextConversation: minaChat,
        })
        expect(store.get(charactersAtom)).toEqual([archived, mina])
        expect(store.get(conversationsAtom).map((item) => item.id)).toEqual([
            testId(101),
            testId(102),
        ])
        expect(store.get(selectedCharacterIdAtom)).toBe(mina.id)
        expect(store.get(selectedConversationIdAtom)).toBe(minaChat.id)
        expect(store.get(characterAssetsAtom)).toEqual([])
    })

    test('keeps the selection when another character is deleted', async () => {
        const store = storeWith([aria, mina])
        store.set(selectedConversationIdAtom, testId(100))
        spyOn(api, 'deleteCharacter').mockResolvedValue(undefined)

        const result = await store.set(deleteCharacterAtom, mina.id)

        expect(result).toMatchObject({ ok: true, wasSelected: false })
        expect(store.get(selectedCharacterIdAtom)).toBe(aria.id)
        expect(store.get(selectedConversationIdAtom)).toBe(testId(100))
    })

    test('reports a failed delete', async () => {
        const store = storeWith([aria])
        spyOn(api, 'deleteCharacter').mockRejectedValue(new Error('locked'))

        expect(await store.set(deleteCharacterAtom, aria.id)).toEqual({
            ok: false,
            wasSelected: false,
            nextCharacter: null,
            nextConversation: null,
        })
        expect(store.get(charactersAtom)).toEqual([aria])
        expect(store.get(workspaceErrorAtom)).toBe('locked')
    })
})

describe('importing characters', () => {
    test('shows progress, then adds and selects the imported character', async () => {
        const store = storeWith([mina], mina.id)
        store.set(selectedConversationIdAtom, testId(100))
        const loading = recordLoading(store)
        spyOn(api, 'importCharacter').mockImplementation(async (_file, onProgress) => {
            onProgress?.({ phase: 'reading' })
            return { character: aria, warnings: [] }
        })
        spyOn(api, 'characterAssets').mockResolvedValue({ assets: [makeAsset()] })

        expect(await store.set(importCharacterAtom, file)).toBe(aria)

        expect(loading.map((state) => state?.detail)).toContain('파일 분석 중…')
        expect(loading.at(-1)).toBeNull()
        expect(store.get(charactersAtom)).toEqual([aria, mina])
        expect(store.get(characterAssetsAtom)).toEqual([makeAsset()])
        expect(store.get(selectedCharacterIdAtom)).toBe(aria.id)
        expect(store.get(selectedConversationIdAtom)).toBeNull()
        expect(store.get(mobileSidebarOpenAtom)).toBe(true)
    })

    test('reports a failed import and closes the progress dialog', async () => {
        const store = storeWith([mina], mina.id)
        spyOn(api, 'importCharacter').mockRejectedValue(new Error('Invalid CHARX archive'))

        expect(await store.set(importCharacterAtom, file)).toBeNull()
        expect(store.get(workspaceErrorAtom)).toBe('Invalid CHARX archive')
        expect(store.get(loadingAtom)).toBeNull()
        expect(store.get(charactersAtom)).toEqual([mina])
    })

    test('adds a package’s conversations, groups and personas and opens its first chat', async () => {
        const store = storeWith([mina], mina.id)
        const existingPersona = makePersona({ id: testId(301) })
        store.set(personaListAtom, [existingPersona])
        const chats = [
            makeConversation({ id: testId(110), characterId: aria.id }),
            makeConversation({ id: testId(111), characterId: aria.id }),
        ]
        const group = {
            id: testId(120),
            characterId: aria.id,
            name: 'Arc 1',
            sortOrder: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        }
        const persona = makePersona({ id: testId(302) })
        spyOn(api, 'importCharacterPackage').mockResolvedValue({
            character: aria,
            conversations: chats,
            conversationGroups: [group],
            personas: [persona],
            warnings: [],
        })
        spyOn(api, 'characterAssets').mockResolvedValue({ assets: [] })

        const result = await store.set(importCharacterPackageAtom, file)

        expect(result?.character).toBe(aria)
        expect(store.get(conversationsAtom)).toEqual(chats)
        expect(store.get(conversationGroupsAtom)).toEqual([group])
        expect(store.get(personaListAtom)).toEqual([existingPersona, persona])
        expect(store.get(selectedCharacterIdAtom)).toBe(aria.id)
        expect(store.get(selectedConversationIdAtom)).toBe(testId(110))
    })
})

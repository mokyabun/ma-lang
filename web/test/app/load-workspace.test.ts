import { describe, expect, spyOn, test } from 'bun:test'

import type { Character, Conversation } from '@malang/shared'
import {
    makeAsset,
    makeCharacter,
    makeConversation,
    makePersona,
    makeSettings,
    testId,
} from '@test/helpers/fixtures'
import { createStore } from 'jotai'

import { loadWorkspaceAtom } from '@/app/load-workspace'
import { characterAssetsAtom } from '@/features/characters/atom'
import { personaListAtom, selectedPersonaIdAtom } from '@/features/personas/atom'
import { api } from '@/lib/api'
import {
    charactersAtom,
    conversationsAtom,
    selectedCharacterIdAtom,
    selectedConversationIdAtom,
    settingsAtom,
    workspaceErrorAtom,
    workspaceInitializedAtom,
    workspaceLoadingAtom,
} from '@/lib/store'

const ARCHIVED = '2026-01-02T00:00:00.000Z'
const archived = makeCharacter({ id: testId(10), name: 'Old', archivedAt: ARCHIVED })
const aria = makeCharacter({ id: testId(11), name: 'Aria' })
const mina = makeCharacter({ id: testId(12), name: 'Mina' })
const ariaChat = makeConversation({ id: testId(100), characterId: aria.id })
const minaArchivedChat = makeConversation({
    id: testId(101),
    characterId: mina.id,
    archivedAt: ARCHIVED,
})
const minaChat = makeConversation({ id: testId(102), characterId: mina.id })

function stubWorkspace(
    characters: Character[] = [archived, aria, mina],
    conversations: Conversation[] = [ariaChat, minaArchivedChat, minaChat],
) {
    const settings = makeSettings({ selectedPersonaId: testId(300) })
    spyOn(api, 'characters').mockResolvedValue({ characters, groups: [] })
    spyOn(api, 'conversations').mockResolvedValue({ conversations, groups: [] })
    spyOn(api, 'settings').mockResolvedValue(settings)
    spyOn(api, 'provider').mockResolvedValue(null)
    spyOn(api, 'promptPresets').mockResolvedValue({ promptPresets: [] })
    spyOn(api, 'promptModules').mockResolvedValue({ modules: [] })
    spyOn(api, 'personas').mockResolvedValue({ personas: [makePersona()] })
    spyOn(api, 'modelCatalog').mockResolvedValue({ presets: [], apiKeys: [] })
    spyOn(api, 'modelChains').mockResolvedValue({ presets: [] })
    return {
        settings,
        detail: spyOn(api, 'character').mockImplementation(async (id) => ({
            ...[aria, mina].find((character) => character.id === id)!,
            description: 'full record',
        })),
        assets: spyOn(api, 'characterAssets').mockResolvedValue({ assets: [makeAsset()] }),
    }
}

describe('workspace loading', () => {
    test('opens the first active character and its first open conversation', async () => {
        const { settings, detail } = stubWorkspace()
        const store = createStore()

        await store.set(loadWorkspaceAtom, {})

        expect(store.get(selectedCharacterIdAtom)).toBe(aria.id)
        expect(store.get(selectedConversationIdAtom)).toBe(ariaChat.id)
        expect(store.get(settingsAtom)).toBe(settings)
        expect(store.get(personaListAtom)).toEqual([makePersona()])
        expect(store.get(selectedPersonaIdAtom)).toBe(testId(300))
        expect(detail).not.toHaveBeenCalled()
        expect(store.get(workspaceInitializedAtom)).toBe(true)
        expect(store.get(workspaceLoadingAtom)).toBe(false)
    })

    test('opens the requested character with its full record and assets', async () => {
        const { detail } = stubWorkspace()
        const store = createStore()

        await store.set(loadWorkspaceAtom, { requestedCharacterId: mina.id })

        expect(detail).toHaveBeenCalledWith(mina.id)
        expect(store.get(charactersAtom).find((item) => item.id === mina.id)?.description).toBe(
            'full record',
        )
        expect(store.get(characterAssetsAtom)).toEqual([makeAsset()])
        expect(store.get(selectedCharacterIdAtom)).toBe(mina.id)
        expect(store.get(selectedConversationIdAtom)).toBe(minaChat.id)
    })

    test('opens a requested conversation and skips archived requests', async () => {
        stubWorkspace()
        const store = createStore()

        await store.set(loadWorkspaceAtom, {
            requestedCharacterId: mina.id,
            requestedConversationId: minaArchivedChat.id,
        })
        expect(store.get(selectedConversationIdAtom)).toBe(minaChat.id)

        await store.set(loadWorkspaceAtom, {
            requestedCharacterId: archived.id,
            requestedConversationId: ariaChat.id,
        })
        expect(store.get(selectedCharacterIdAtom)).toBe(aria.id)
        expect(store.get(selectedConversationIdAtom)).toBe(ariaChat.id)
    })

    test('keeps the list entry when the full record cannot be read', async () => {
        const { detail } = stubWorkspace()
        detail.mockRejectedValue(new Error('not found'))
        const store = createStore()

        await store.set(loadWorkspaceAtom, { requestedCharacterId: mina.id })

        expect(store.get(charactersAtom)).toEqual([archived, aria, mina])
        expect(store.get(characterAssetsAtom)).toEqual([])
        expect(store.get(selectedCharacterIdAtom)).toBe(mina.id)
        expect(store.get(workspaceErrorAtom)).toBe('')
    })

    test('selects a cached conversation of the same character before the reload ends', async () => {
        stubWorkspace()
        const store = createStore()
        await store.set(loadWorkspaceAtom, { requestedCharacterId: mina.id })
        const otherMinaChat = makeConversation({ id: testId(103), characterId: mina.id })
        store.set(conversationsAtom, (current) => [...current, otherMinaChat])
        const characters = Promise.withResolvers<{ characters: Character[]; groups: [] }>()
        spyOn(api, 'characters').mockReturnValue(characters.promise)

        const reloading = store.set(loadWorkspaceAtom, {
            requestedCharacterId: mina.id,
            requestedConversationId: otherMinaChat.id,
        })
        expect(store.get(selectedConversationIdAtom)).toBe(otherMinaChat.id)
        expect(store.get(workspaceLoadingAtom)).toBe(true)

        characters.resolve({ characters: [archived, aria, mina], groups: [] })
        await reloading
    })

    test('ignores a load while another one runs', async () => {
        stubWorkspace()
        const store = createStore()
        store.set(workspaceLoadingAtom, true)

        await store.set(loadWorkspaceAtom, {})

        expect(api.characters).not.toHaveBeenCalled()
        expect(store.get(workspaceInitializedAtom)).toBe(false)
    })

    test('reports a failed load and still finishes initializing', async () => {
        stubWorkspace()
        spyOn(api, 'settings').mockRejectedValue(new Error('Session expired'))
        const store = createStore()

        await store.set(loadWorkspaceAtom, {})

        expect(store.get(workspaceErrorAtom)).toBe('Session expired')
        expect(store.get(charactersAtom)).toEqual([])
        expect(store.get(workspaceInitializedAtom)).toBe(true)
        expect(store.get(workspaceLoadingAtom)).toBe(false)
    })
})

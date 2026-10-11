import { describe, expect, spyOn, test } from 'bun:test'

import { makeCharacter, makeConversation, makeSettings, testId } from '@test/helpers/fixtures'
import { createStore } from 'jotai'

import { api } from '@/lib/api'
import {
    activeCharactersAtom,
    charactersAtom,
    conversationsAtom,
    promptToggleRevisionAtom,
    selectedCharacterAtom,
    selectedCharacterIdAtom,
    selectedConversationAtom,
    selectedConversationIdAtom,
    settingsAtom,
    updatePromptToggleValuesAtom,
    workspaceErrorAtom,
} from '@/lib/store'

describe('shared entity state', () => {
    test('resolves the selected character and conversation from their ids', () => {
        const store = createStore()
        const aria = makeCharacter({ id: testId(10) })
        const chat = makeConversation({ id: testId(100) })
        store.set(charactersAtom, [aria])
        store.set(conversationsAtom, [chat])
        expect(store.get(selectedCharacterAtom)).toBeNull()

        store.set(selectedCharacterIdAtom, aria.id)
        store.set(selectedConversationIdAtom, chat.id)
        expect(store.get(selectedCharacterAtom)).toBe(aria)
        expect(store.get(selectedConversationAtom)).toBe(chat)

        store.set(selectedConversationIdAtom, testId(999))
        expect(store.get(selectedConversationAtom)).toBeNull()
    })

    test('lists only characters that are not archived', () => {
        const store = createStore()
        store.set(charactersAtom, [
            makeCharacter({ id: testId(10) }),
            makeCharacter({ id: testId(11), archivedAt: '2026-01-02T00:00:00.000Z' }),
        ])
        expect(store.get(activeCharactersAtom).map((character) => character.id)).toEqual([
            testId(10),
        ])
    })

    test('saves prompt toggle values and invalidates older settings reads', async () => {
        const saved = makeSettings({ promptToggleValues: { quiet: '1' } })
        const update = spyOn(api, 'updateSettings').mockResolvedValue(saved)
        const store = createStore()

        expect(await store.set(updatePromptToggleValuesAtom, { quiet: '1' })).toBe(saved)
        expect(update).toHaveBeenCalledWith({ promptToggleValues: { quiet: '1' } })
        expect(store.get(settingsAtom)).toBe(saved)
        expect(store.get(promptToggleRevisionAtom)).toBe(1)
    })

    test('reports and rethrows a failed prompt toggle save', async () => {
        spyOn(api, 'updateSettings').mockRejectedValue(new Error('offline'))
        const store = createStore()

        const failure = await store
            .set(updatePromptToggleValuesAtom, { quiet: '1' })
            .catch((cause: unknown) => cause)
        expect(failure).toMatchObject({ message: 'offline' })
        expect(store.get(workspaceErrorAtom)).toBe('offline')
        expect(store.get(promptToggleRevisionAtom)).toBe(0)
    })
})

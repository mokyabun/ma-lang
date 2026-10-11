import { describe, expect, spyOn, test } from 'bun:test'

import { makeConversation, makePersona, makeSettings, testId } from '@test/helpers/fixtures'
import { createStore } from 'jotai'

import {
    activePersonaAtom,
    createPersonaAtom,
    deletePersonaAtom,
    editingPersonaIdAtom,
    loadPersonasAtom,
    personaByIdAtom,
    personaErrorAtom,
    personaListAtom,
    personaStatusAtom,
    removePersonaAvatarAtom,
    selectedPersonaIdAtom,
    selectPersonaAtom,
    setPersonaAvatarAtom,
    updatePersonaAtom,
} from '@/features/personas/atom'
import { api } from '@/lib/api'
import { conversationsAtom, settingsAtom } from '@/lib/store'

const minjun = makePersona({ id: testId(300), name: '민준' })
const seoyeon = makePersona({ id: testId(301), name: '서연' })

function storeWith(...personas: ReturnType<typeof makePersona>[]) {
    const store = createStore()
    store.set(personaListAtom, personas)
    return store
}

describe('persona state', () => {
    test('looks personas up by id and resolves the active one', () => {
        const store = storeWith(minjun, seoyeon)
        expect(store.get(personaByIdAtom).get(seoyeon.id)).toBe(seoyeon)
        expect(store.get(activePersonaAtom)).toBeNull()

        store.set(selectedPersonaIdAtom, seoyeon.id)
        expect(store.get(activePersonaAtom)).toBe(seoyeon)
        store.set(selectedPersonaIdAtom, testId(399))
        expect(store.get(activePersonaAtom)).toBeNull()
    })

    test('loads the persona list and reports a failed load', async () => {
        const store = storeWith()
        spyOn(api, 'personas').mockResolvedValueOnce({ personas: [minjun] })
        await store.set(loadPersonasAtom)
        expect(store.get(personaListAtom)).toEqual([minjun])
        expect(store.get(personaStatusAtom)).toBe('idle')

        spyOn(api, 'personas').mockRejectedValueOnce(new Error('offline'))
        await store.set(loadPersonasAtom)
        expect(store.get(personaErrorAtom)).toBe('offline')
        expect(store.get(personaListAtom)).toEqual([minjun])
    })

    test('creates a persona and opens it for editing', async () => {
        const store = storeWith(minjun)
        spyOn(api, 'createPersona').mockResolvedValue(seoyeon)

        const input = { name: '서연', description: '', note: '' }
        expect(await store.set(createPersonaAtom, input)).toBe(seoyeon)
        expect(store.get(personaListAtom)).toEqual([minjun, seoyeon])
        expect(store.get(editingPersonaIdAtom)).toBe(seoyeon.id)
        expect(store.get(personaStatusAtom)).toBe('idle')
    })

    test('replaces an updated persona and reports a failed update', async () => {
        const store = storeWith(minjun, seoyeon)
        const renamed = { ...minjun, name: '민준 (회사)' }
        const update = spyOn(api, 'updatePersona').mockResolvedValueOnce(renamed)

        expect(
            await store.set(updatePersonaAtom, { id: minjun.id, input: { name: renamed.name } }),
        ).toBe(renamed)
        expect(store.get(personaListAtom)).toEqual([renamed, seoyeon])

        update.mockRejectedValueOnce(new Error('too long'))
        expect(
            await store.set(updatePersonaAtom, { id: minjun.id, input: { name: 'x' } }),
        ).toBeNull()
        expect(store.get(personaErrorAtom)).toBe('too long')
        expect(store.get(personaStatusAtom)).toBe('idle')
    })

    test('deletes a persona, unbinds its conversations and follows the server selection', async () => {
        const store = storeWith(minjun, seoyeon)
        store.set(selectedPersonaIdAtom, minjun.id)
        store.set(editingPersonaIdAtom, minjun.id)
        store.set(conversationsAtom, [
            makeConversation({ id: testId(100), boundPersonaId: minjun.id, personaLocked: true }),
            makeConversation({ id: testId(101), boundPersonaId: seoyeon.id, personaLocked: true }),
        ])
        const settings = makeSettings({ selectedPersonaId: seoyeon.id })
        spyOn(api, 'deletePersona').mockResolvedValue(undefined)
        spyOn(api, 'settings').mockResolvedValue(settings)

        await store.set(deletePersonaAtom, minjun.id)

        expect(store.get(personaListAtom)).toEqual([seoyeon])
        expect(
            store.get(conversationsAtom).map(({ boundPersonaId, personaLocked }) => ({
                boundPersonaId,
                personaLocked,
            })),
        ).toEqual([
            { boundPersonaId: null, personaLocked: false },
            { boundPersonaId: seoyeon.id, personaLocked: true },
        ])
        expect(store.get(settingsAtom)).toBe(settings)
        expect(store.get(selectedPersonaIdAtom)).toBe(seoyeon.id)
        expect(store.get(editingPersonaIdAtom)).toBeNull()
    })

    test('keeps everything when a delete fails', async () => {
        const store = storeWith(minjun)
        spyOn(api, 'deletePersona').mockRejectedValue(new Error('in use'))

        await store.set(deletePersonaAtom, minjun.id)

        expect(store.get(personaListAtom)).toEqual([minjun])
        expect(store.get(personaErrorAtom)).toBe('in use')
    })

    test('sets and removes the avatar', async () => {
        const store = storeWith(minjun)
        const withAvatar = { ...minjun, avatarAssetId: testId(400) }
        spyOn(api, 'uploadPersonaAvatar').mockResolvedValue(withAvatar)
        spyOn(api, 'removePersonaAvatar').mockRejectedValue(new Error('missing'))

        await store.set(setPersonaAvatarAtom, { id: minjun.id, file: new File(['png'], 'a.png') })
        expect(store.get(personaListAtom)).toEqual([withAvatar])

        await store.set(removePersonaAvatarAtom, minjun.id)
        expect(store.get(personaListAtom)).toEqual([withAvatar])
        expect(store.get(personaErrorAtom)).toBe('missing')
    })

    test('selects the active persona through the settings', async () => {
        const store = storeWith(minjun)
        const settings = makeSettings({ selectedPersonaId: minjun.id })
        const update = spyOn(api, 'updateSettings').mockResolvedValueOnce(settings)

        expect(await store.set(selectPersonaAtom, minjun.id)).toBe(settings)
        expect(update).toHaveBeenCalledWith({ selectedPersonaId: minjun.id })
        expect(store.get(selectedPersonaIdAtom)).toBe(minjun.id)
        expect(store.get(settingsAtom)).toBe(settings)

        update.mockRejectedValueOnce(new Error('offline'))
        expect(await store.set(selectPersonaAtom, null)).toBeNull()
        expect(store.get(selectedPersonaIdAtom)).toBe(minjun.id)
        expect(store.get(personaErrorAtom)).toBe('offline')
    })
})

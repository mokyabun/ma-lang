import type { Persona, PersonaCreate, PersonaUpdate } from '@malang/shared'
import { atom } from 'jotai'

import { api } from '@/lib/api'
import { conversationsAtom, settingsAtom } from '@/lib/store'

export const personaListAtom = atom<Persona[]>([])

export const selectedPersonaIdAtom = atom<string | null>(null)

export const editingPersonaIdAtom = atom<string | null>(null)

export const personaStatusAtom = atom<'idle' | 'loading' | 'saving'>('idle')

export const personaErrorAtom = atom('')

export const personaByIdAtom = atom((get) => {
    const map = new Map<string, Persona>()
    for (const persona of get(personaListAtom)) map.set(persona.id, persona)
    return map
})

export const activePersonaAtom = atom((get) => {
    const id = get(selectedPersonaIdAtom)
    return id ? (get(personaByIdAtom).get(id) ?? null) : null
})

export const effectivePersonaAtom = atom((get) => {
    return get(activePersonaAtom)
})

export const loadPersonasAtom = atom(null, async (_get, set) => {
    set(personaStatusAtom, 'loading')
    try {
        const result = await api.personas()
        set(personaListAtom, result.personas)
    } catch (cause) {
        set(
            personaErrorAtom,
            cause instanceof Error ? cause.message : '페르소나를 불러오지 못했습니다.',
        )
    } finally {
        set(personaStatusAtom, 'idle')
    }
})

export const createPersonaAtom = atom(null, async (_get, set, input: PersonaCreate) => {
    set(personaStatusAtom, 'saving')
    try {
        const persona = await api.createPersona(input)
        set(personaListAtom, (current) => [...current, persona])
        set(editingPersonaIdAtom, persona.id)
        return persona
    } catch (cause) {
        set(
            personaErrorAtom,
            cause instanceof Error ? cause.message : '페르소나를 만들지 못했습니다.',
        )
        return null
    } finally {
        set(personaStatusAtom, 'idle')
    }
})

export const updatePersonaAtom = atom(
    null,
    async (_get, set, { id, input }: { id: string; input: PersonaUpdate }) => {
        set(personaStatusAtom, 'saving')
        try {
            const persona = await api.updatePersona(id, input)
            set(personaListAtom, (current) =>
                current.map((item) => (item.id === persona.id ? persona : item)),
            )
            return persona
        } catch (cause) {
            set(
                personaErrorAtom,
                cause instanceof Error ? cause.message : '페르소나를 저장하지 못했습니다.',
            )
            return null
        } finally {
            set(personaStatusAtom, 'idle')
        }
    },
)

export const deletePersonaAtom = atom(null, async (get, set, id: string) => {
    try {
        await api.deletePersona(id)
        const settings = await api.settings()
        set(personaListAtom, (current) => current.filter((item) => item.id !== id))
        set(conversationsAtom, (current) =>
            current.map((conversation) =>
                conversation.boundPersonaId === id
                    ? { ...conversation, boundPersonaId: null, personaLocked: false }
                    : conversation,
            ),
        )
        set(settingsAtom, settings)
        set(selectedPersonaIdAtom, settings.selectedPersonaId)
        if (get(editingPersonaIdAtom) === id) set(editingPersonaIdAtom, null)
    } catch (cause) {
        set(
            personaErrorAtom,
            cause instanceof Error ? cause.message : '페르소나를 삭제하지 못했습니다.',
        )
    }
})

export const setPersonaAvatarAtom = atom(
    null,
    async (_get, set, { id, file }: { id: string; file: File }) => {
        try {
            const persona = await api.uploadPersonaAvatar(id, file)
            set(personaListAtom, (current) =>
                current.map((item) => (item.id === persona.id ? persona : item)),
            )
        } catch (cause) {
            set(
                personaErrorAtom,
                cause instanceof Error ? cause.message : '아바타를 저장하지 못했습니다.',
            )
        }
    },
)

export const removePersonaAvatarAtom = atom(null, async (_get, set, id: string) => {
    try {
        const persona = await api.removePersonaAvatar(id)
        set(personaListAtom, (current) =>
            current.map((item) => (item.id === persona.id ? persona : item)),
        )
    } catch (cause) {
        set(
            personaErrorAtom,
            cause instanceof Error ? cause.message : '아바타를 제거하지 못했습니다.',
        )
    }
})

export const selectPersonaAtom = atom(null, async (_get, set, id: string | null) => {
    try {
        const settings = await api.updateSettings({ selectedPersonaId: id })
        set(selectedPersonaIdAtom, settings.selectedPersonaId)
        set(settingsAtom, settings)
        return settings
    } catch (cause) {
        set(
            personaErrorAtom,
            cause instanceof Error ? cause.message : '활성 페르소나를 저장하지 못했습니다.',
        )
        return null
    }
})

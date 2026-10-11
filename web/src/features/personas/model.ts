import type { Persona, PersonaCreate, PersonaUpdate } from '@malang/shared'

export function personaDraftFrom(persona: Persona): PersonaUpdate {
    return {
        name: persona.name,
        description: persona.description,
        note: persona.note,
    }
}

export function blankPersonaDraft(): PersonaCreate {
    return { name: '새 페르소나', description: '', note: '' }
}

export function personaLabel(persona: Persona): string {
    const name = persona.name || '이름 없는 페르소나'
    const note = persona.note.trim()
    return note ? `${name} (${note})` : name
}

export function isPersonaDraftDirty(draft: PersonaUpdate, persona: Persona): boolean {
    return (
        draft.name !== persona.name ||
        draft.description !== persona.description ||
        draft.note !== persona.note
    )
}

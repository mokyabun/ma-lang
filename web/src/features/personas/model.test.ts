import { describe, expect, test } from 'bun:test'

import type { Persona } from '@malang/shared'

import { personaLabel } from './model'

function persona(input: Pick<Persona, 'name' | 'note'>): Persona {
    return {
        id: '00000000-0000-4000-8000-000000000001',
        description: '',
        avatarAssetId: null,
        createdAt: '2026-09-04T00:00:00.000Z',
        updatedAt: '2026-09-04T00:00:00.000Z',
        ...input,
    }
}

describe('persona labels', () => {
    test('shows the name and note in dropdown format', () => {
        expect(personaLabel(persona({ name: '민준', note: '테스트용' }))).toBe('민준 (테스트용)')
    })

    test('does not add empty parentheses when there is no note', () => {
        expect(personaLabel(persona({ name: '민준', note: '   ' }))).toBe('민준')
    })
})

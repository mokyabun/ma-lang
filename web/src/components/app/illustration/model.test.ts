import { describe, expect, test } from 'bun:test'

import type { IllustrationActor, IllustrationStateDefinition, LoreEntry } from '@malang/shared'

import {
    actorsFromLore,
    attachOutfitIds,
    blankActorInput,
    blankOutfit,
    blankStateDefinition,
    isStateDefinitionSaveable,
    splitKeys,
    withStateValue,
    withDefaultOutfit,
    withParam,
} from './model'

const actor = (overrides: Partial<IllustrationActor> = {}): IllustrationActor => ({
    id: 'actor',
    characterId: 'character',
    personaId: null,
    name: 'Aria',
    keys: [],
    promptTemplate: '',
    negative: '',
    enabled: true,
    sortOrder: 0,
    outfits: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
})

describe('illustration editor model', () => {
    test('splits comma-separated keys', () => {
        expect(splitKeys(' aria, 아리아 ,, ')).toEqual(['aria', '아리아'])
    })

    test('makes one outfit the default', () => {
        const outfits = [blankOutfit(true), blankOutfit(false), blankOutfit(false)]
        expect(withDefaultOutfit(outfits, 2).map((outfit) => outfit.isDefault)).toEqual([
            false,
            false,
            true,
        ])
    })

    test('turns lore entries into actor drafts, skipping names already used', () => {
        const entries = [
            { name: 'Bell', keys: ['bell', '벨'] },
            { name: 'aria', keys: ['aria'] },
            { name: ' ', keys: ['blank'] },
        ] as LoreEntry[]
        expect(actorsFromLore(entries, [actor()])).toEqual([
            blankActorInput('Bell', ['bell', '벨']),
        ])
    })

    test('attaches server ids to outfits created by the last save', () => {
        const sent = { ...blankActorInput('Aria'), outfits: [blankOutfit(true)] }
        const current = {
            ...sent,
            outfits: [{ ...sent.outfits[0]!, prompt: 'edited after sending' }, blankOutfit(false)],
        }
        const saved = actor({
            outfits: [
                {
                    ...blankOutfit(true),
                    id: 'outfit-1',
                    actorId: 'actor',
                    conversationId: null,
                    sortOrder: 0,
                },
            ],
        })

        const merged = attachOutfitIds(current, sent, saved)
        expect(merged.outfits.map((outfit) => outfit.id)).toEqual(['outfit-1', undefined])
        expect(merged.outfits[0]!.prompt).toBe('edited after sending')
    })

    test('clears a parameter override with undefined', () => {
        expect(withParam({ steps: 20, scale: 5 }, 'steps', undefined)).toEqual({ scale: 5 })
        expect(withParam({}, 'sampler', 'k_euler')).toEqual({ sampler: 'k_euler' })
    })
})

describe('continuity editing', () => {
    const wet = {
        ...blankStateDefinition('wet'),
        id: 'definition',
        characterId: null,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
        lifetimeTurns: 2,
    } as IllustrationStateDefinition

    test('sets a state with its lifetime from the current turn and clears it again', () => {
        const draft = { present: [], outfits: {}, states: {} }
        const set = withStateValue(draft, 'aria', wet, true, 4)
        expect(set.states).toEqual({ aria: { wet: { value: true, expiresAfterTurn: 5 } } })
        expect(withStateValue(set, 'aria', wet, null, 4).states).toEqual({})
        expect(draft.states).toEqual({})
    })

    test('only saves definitions the server accepts', () => {
        expect(isStateDefinitionSaveable(blankStateDefinition('wet'))).toBe(true)
        expect(isStateDefinitionSaveable({ ...blankStateDefinition('has space') })).toBe(false)
        expect(isStateDefinitionSaveable({ ...blankStateDefinition('mood'), kind: 'choice' })).toBe(
            false,
        )
    })
})

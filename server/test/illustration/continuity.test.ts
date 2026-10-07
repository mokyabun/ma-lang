import { describe, expect, test } from 'bun:test'

import type { IllustrationState, IllustrationStateDefinition } from '@malang/shared'

import { applyContinuity, EMPTY_STATE, pruneState, stateTags } from '@/services/illustration'

const aria = '11111111-1111-4111-8111-111111111111'
const bell = '22222222-2222-4222-8222-222222222222'
const pajamas = '33333333-3333-4333-8333-333333333333'
const uniform = '44444444-4444-4444-8444-444444444444'

function definition(
    overrides: Partial<IllustrationStateDefinition> &
        Pick<IllustrationStateDefinition, 'key' | 'kind'>,
): IllustrationStateDefinition {
    return {
        id: crypto.randomUUID(),
        characterId: null,
        label: overrides.key,
        instruction: '',
        tags: '',
        options: [],
        thresholds: [],
        lifetimeTurns: null,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
        ...overrides,
    }
}

const definitions = [
    definition({ key: 'wet', kind: 'flag', tags: 'wet, wet hair', lifetimeTurns: 2 }),
    definition({
        key: 'injury',
        kind: 'choice',
        options: [
            { value: 'light', tags: 'bandage' },
            { value: 'heavy', tags: 'bandaged arm, sling' },
        ],
    }),
    definition({
        key: 'kisses',
        kind: 'counter',
        thresholds: [
            { min: 1, tags: 'blush' },
            { min: 5, tags: 'heavy blush, heart-shaped pupils' },
        ],
    }),
]

describe('applyContinuity', () => {
    test('starts from an empty state and records the turn', () => {
        const { state, warnings } = applyContinuity(
            null,
            {
                present: [aria, bell, aria],
                outfits: [{ actorId: aria, outfitId: pajamas }],
                states: [
                    { actorId: aria, key: 'wet', op: 'set' },
                    { actorId: bell, key: 'injury', op: 'choose', value: 'light' },
                    { actorId: aria, key: 'kisses', op: 'increment' },
                ],
            },
            definitions,
            3,
        )
        expect(warnings).toEqual([])
        expect(state).toEqual({
            present: [aria, bell],
            outfits: { [aria]: { outfitId: pajamas, locked: false } },
            states: {
                [aria]: { wet: { value: true, expiresAfterTurn: 4 }, kisses: { value: 1 } },
                [bell]: { injury: { value: 'light' } },
            },
            turn: 3,
        })
    })

    test('keeps a locked outfit and the previous presence when none is reported', () => {
        const previous: IllustrationState = {
            ...EMPTY_STATE,
            present: [aria],
            outfits: { [aria]: { outfitId: uniform, locked: true } },
        }
        const { state, warnings } = applyContinuity(
            previous,
            { outfits: [{ actorId: aria, outfitId: pajamas }] },
            definitions,
            2,
        )
        expect(state.present).toEqual([aria])
        expect(state.outfits[aria]).toEqual({ outfitId: uniform, locked: true })
        expect(warnings).toEqual([`Kept the locked outfit of ${aria}`])
        // The previous state is left untouched.
        expect(previous.outfits[aria]!.outfitId).toBe(uniform)
    })

    test('expires states after their lifetime and refreshes them when set again', () => {
        const first = applyContinuity(
            null,
            { states: [{ actorId: aria, key: 'wet', op: 'set' }] },
            definitions,
            1,
        ).state
        expect(applyContinuity(first, {}, definitions, 2).state.states[aria]?.wet).toBeDefined()
        expect(applyContinuity(first, {}, definitions, 3).state.states).toEqual({})

        const refreshed = applyContinuity(
            first,
            { states: [{ actorId: aria, key: 'wet', op: 'set' }] },
            definitions,
            2,
        ).state
        expect(refreshed.states[aria]!.wet!.expiresAfterTurn).toBe(3)
    })

    test('increments and clears counters and drops invalid changes', () => {
        const previous = applyContinuity(
            null,
            { states: [{ actorId: aria, key: 'kisses', op: 'set', value: 4 }] },
            definitions,
            1,
        ).state
        const { state, warnings } = applyContinuity(
            previous,
            {
                states: [
                    { actorId: aria, key: 'kisses', op: 'increment', value: 2 },
                    { actorId: aria, key: 'hunger', op: 'set' },
                    { actorId: aria, key: 'injury', op: 'choose', value: 'fatal' },
                    { actorId: aria, key: 'wet', op: 'increment' },
                    { actorId: bell, key: 'injury', op: 'clear' },
                ],
            },
            definitions,
            2,
        )
        expect(state.states).toEqual({ [aria]: { kisses: { value: 6 } } })
        expect(warnings).toEqual([
            'Ignored undefined state "hunger"',
            'Ignored choose on choice state "injury"',
            'Ignored increment on flag state "wet"',
        ])
    })
})

describe('state tags', () => {
    test('render flags, choices and the highest counter threshold reached', () => {
        expect(
            stateTags(
                {
                    wet: { value: true },
                    injury: { value: 'heavy' },
                    kisses: { value: 5 },
                    unknown: { value: true },
                },
                definitions,
            ),
        ).toBe('wet, wet hair, bandaged arm, sling, heavy blush, heart-shaped pupils')
        expect(stateTags({ kisses: { value: 0 } }, definitions)).toBe('')
        expect(stateTags(undefined, definitions)).toBe('')
    })
})

describe('pruneState', () => {
    test('drops removed actors and outfits', () => {
        const state: IllustrationState = {
            present: [aria, bell],
            outfits: {
                [aria]: { outfitId: pajamas, locked: true },
                [bell]: { outfitId: uniform, locked: false },
            },
            states: { [bell]: { wet: { value: true } } },
            turn: 4,
        }
        expect(pruneState(state, new Set([aria]), new Set())).toEqual({
            present: [aria],
            outfits: { [aria]: { outfitId: null, locked: true } },
            states: {},
            turn: 4,
        })
    })
})

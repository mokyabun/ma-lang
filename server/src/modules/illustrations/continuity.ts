import type {
    IllustrationState,
    IllustrationStateDefinition,
    IllustrationStateValue,
} from '@malang/shared'

export const EMPTY_STATE: IllustrationState = { present: [], outfits: {}, states: {}, turn: 0 }

export type StateOp = 'set' | 'clear' | 'increment' | 'choose'

/** What one analyzed response changed, with actors already resolved to ids. */
export interface ContinuityDelta {
    present?: string[]
    outfits?: Array<{ actorId: string; outfitId: string }>
    states?: Array<{
        actorId: string
        key: string
        op: StateOp
        value?: string | number | null
    }>
}

export interface ContinuityResult {
    state: IllustrationState
    warnings: string[]
}

/**
 * Applies one response's changes on top of the previous state. Locked outfits stay put,
 * unknown keys and invalid values are dropped with a warning, and states whose lifetime
 * ran out before `turn` disappear.
 */
export function applyContinuity(
    previous: IllustrationState | null,
    delta: ContinuityDelta,
    definitions: IllustrationStateDefinition[],
    turn: number,
): ContinuityResult {
    const warnings: string[] = []
    const base = previous ?? EMPTY_STATE
    const state: IllustrationState = {
        present: delta.present ? [...new Set(delta.present)] : [...base.present],
        outfits: structuredClone(base.outfits),
        states: expire(base.states, turn),
        turn,
    }

    for (const change of delta.outfits ?? []) {
        if (state.outfits[change.actorId]?.locked) {
            warnings.push(`Kept the locked outfit of ${change.actorId}`)
            continue
        }
        state.outfits[change.actorId] = { outfitId: change.outfitId, locked: false }
    }

    const byKey = new Map(definitions.map((definition) => [definition.key, definition]))
    for (const change of delta.states ?? []) {
        const definition = byKey.get(change.key)
        if (!definition) {
            warnings.push(`Ignored undefined state "${change.key}"`)
            continue
        }
        const actorStates = (state.states[change.actorId] ??= {})
        if (change.op === 'clear') {
            delete actorStates[change.key]
            continue
        }
        const value = nextValue(definition, change.op, change.value, actorStates[change.key])
        if (value === undefined) {
            warnings.push(`Ignored ${change.op} on ${definition.kind} state "${change.key}"`)
            continue
        }
        actorStates[change.key] = withLifetime(value, definition, turn)
    }

    for (const [actorId, values] of Object.entries(state.states)) {
        if (!Object.keys(values).length) delete state.states[actorId]
    }
    return { state, warnings }
}

function expire(states: IllustrationState['states'], turn: number): IllustrationState['states'] {
    const next: IllustrationState['states'] = {}
    for (const [actorId, values] of Object.entries(states)) {
        const kept = Object.entries(values).filter(
            ([, entry]) => entry.expiresAfterTurn === undefined || entry.expiresAfterTurn >= turn,
        )
        if (kept.length)
            next[actorId] = Object.fromEntries(kept.map(([key, entry]) => [key, { ...entry }]))
    }
    return next
}

function nextValue(
    definition: IllustrationStateDefinition,
    op: Exclude<StateOp, 'clear'>,
    raw: string | number | null | undefined,
    current: IllustrationStateValue | undefined,
): IllustrationStateValue['value'] | undefined {
    if (definition.kind === 'flag') return op === 'set' ? true : undefined
    if (definition.kind === 'counter') {
        const amount = typeof raw === 'number' ? raw : raw ? Number(raw) : Number.NaN
        if (op === 'set') return Number.isFinite(amount) ? amount : undefined
        if (op !== 'increment') return undefined
        const previous = typeof current?.value === 'number' ? current.value : 0
        return previous + (Number.isFinite(amount) ? amount : 1)
    }
    if (op === 'increment' || raw === null || raw === undefined) return undefined
    const choice = definition.options.find((option) => option.value === String(raw))
    return choice?.value
}

function withLifetime(
    value: IllustrationStateValue['value'],
    definition: IllustrationStateDefinition,
    turn: number,
): IllustrationStateValue {
    // A state set this turn and lasting N turns is last shown on turn + N - 1.
    return definition.lifetimeTurns
        ? { value, expiresAfterTurn: turn + definition.lifetimeTurns - 1 }
        : { value }
}

/** The `<<state>>` tags for one actor's current states. */
export function stateTags(
    values: Record<string, IllustrationStateValue> | undefined,
    definitions: IllustrationStateDefinition[],
): string {
    if (!values) return ''
    const tags: string[] = []
    for (const definition of definitions) {
        const entry = values[definition.key]
        if (!entry) continue
        if (definition.kind === 'flag') tags.push(definition.tags)
        if (definition.kind === 'choice') {
            tags.push(definition.options.find((option) => option.value === entry.value)?.tags ?? '')
        }
        if (definition.kind === 'counter' && typeof entry.value === 'number') {
            const reached = definition.thresholds
                .filter((threshold) => threshold.min <= (entry.value as number))
                .sort((left, right) => right.min - left.min)[0]
            if (reached) tags.push(reached.tags)
        }
    }
    return tags.filter((tag) => tag.trim()).join(', ')
}

/** Drops actors and outfits that no longer exist, e.g. after an actor was deleted. */
export function pruneState(
    state: IllustrationState,
    actorIds: Set<string>,
    outfitIds: Set<string>,
): IllustrationState {
    return {
        present: state.present.filter((id) => actorIds.has(id)),
        outfits: Object.fromEntries(
            Object.entries(state.outfits)
                .filter(([actorId]) => actorIds.has(actorId))
                .map(([actorId, outfit]) => [
                    actorId,
                    outfit.outfitId && !outfitIds.has(outfit.outfitId)
                        ? { ...outfit, outfitId: null }
                        : outfit,
                ]),
        ),
        states: Object.fromEntries(
            Object.entries(state.states).filter(([actorId]) => actorIds.has(actorId)),
        ),
        turn: state.turn,
    }
}

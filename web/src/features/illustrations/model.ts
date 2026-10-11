import type {
    ContinuityUpdate,
    ConversationContinuity,
    IllustrationActor,
    IllustrationActorInput,
    IllustrationOutfitInput,
    IllustrationStateDefinition,
    IllustrationStateDefinitionInput,
    IllustrationStateValue,
    IllustrationStyle,
    IllustrationStyleInput,
    LoreEntry,
    NovelAIImageParams,
} from '@malang/shared'

export const DEFAULT_ACTOR_TEMPLATE = '1girl, <<slot>>, <<outfit>>, <<state>>'

export function splitKeys(value: string): string[] {
    return value
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean)
}

export function blankActorInput(name: string, keys: string[] = []): IllustrationActorInput {
    return {
        name,
        keys: keys.length ? keys : name.trim() ? [name.trim()] : [],
        promptTemplate: DEFAULT_ACTOR_TEMPLATE,
        negative: '',
        enabled: true,
        outfits: [],
    }
}

export function actorInputFrom(actor: IllustrationActor): IllustrationActorInput {
    return {
        name: actor.name,
        keys: actor.keys,
        promptTemplate: actor.promptTemplate,
        negative: actor.negative,
        enabled: actor.enabled,
        sortOrder: actor.sortOrder,
        outfits: actor.outfits.map((outfit) => ({
            id: outfit.id,
            name: outfit.name,
            prompt: outfit.prompt,
            negative: outfit.negative,
            isDefault: outfit.isDefault,
            enabled: outfit.enabled,
        })),
    }
}

export function blankOutfit(isFirst: boolean): IllustrationOutfitInput {
    return { name: '새 의상', prompt: '', negative: '', isDefault: isFirst, enabled: true }
}

/** Marks one outfit as the default and clears the flag everywhere else. */
export function withDefaultOutfit(
    outfits: IllustrationOutfitInput[],
    index: number,
): IllustrationOutfitInput[] {
    return outfits.map((outfit, position) => ({ ...outfit, isDefault: position === index }))
}

/** Lore entries that are not already actors, keyed by their name, become actor drafts. */
export function actorsFromLore(entries: LoreEntry[], actors: IllustrationActor[]) {
    const taken = new Set(actors.map((actor) => actor.name.trim().toLocaleLowerCase()))
    return entries
        .filter((entry) => entry.name.trim() && !taken.has(entry.name.trim().toLocaleLowerCase()))
        .map((entry) => blankActorInput(entry.name.trim(), entry.keys))
}

export function blankStyleInput(): IllustrationStyleInput {
    return {
        name: '새 스타일',
        sceneTemplate: '<<slot>>, very aesthetic, masterpiece, no text',
        negative: '',
        params: {},
    }
}

export function styleInputFrom(style: IllustrationStyle): IllustrationStyleInput {
    return {
        name: style.name,
        sceneTemplate: style.sceneTemplate,
        negative: style.negative,
        params: style.params,
        sortOrder: style.sortOrder,
    }
}

/** Number input text to a parameter value; blank clears an override. */
export function parseParam(value: string): number | undefined {
    if (!value.trim()) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

export function withParam<K extends keyof NovelAIImageParams>(
    params: Partial<NovelAIImageParams>,
    key: K,
    value: NovelAIImageParams[K] | undefined,
): Partial<NovelAIImageParams> {
    const next = { ...params }
    if (value === undefined) delete next[key]
    else next[key] = value
    return next
}

/**
 * Gives outfits created by a save their server ids, so the next save updates them instead
 * of replacing them. Outfits are matched by position in the snapshot that was saved.
 */
export function attachOutfitIds(
    current: IllustrationActorInput,
    sent: IllustrationActorInput,
    saved: IllustrationActor,
): IllustrationActorInput {
    if (current.outfits.every((outfit) => outfit.id)) return current
    return {
        ...current,
        outfits: current.outfits.map((outfit, index) => {
            const wasNew = sent.outfits[index] && !sent.outfits[index]!.id
            const id = saved.outfits[index]?.id
            return !outfit.id && wasNew && id ? { ...outfit, id } : outfit
        }),
    }
}

export function blankStateDefinition(key: string): IllustrationStateDefinitionInput {
    return {
        key,
        label: '새 상태',
        instruction: '',
        kind: 'flag',
        tags: '',
        options: [],
        thresholds: [],
        lifetimeTurns: null,
    }
}

export function stateDefinitionInputFrom(
    definition: IllustrationStateDefinition,
): IllustrationStateDefinitionInput {
    return {
        key: definition.key,
        label: definition.label,
        instruction: definition.instruction,
        kind: definition.kind,
        tags: definition.tags,
        options: definition.options,
        thresholds: definition.thresholds,
        lifetimeTurns: definition.lifetimeTurns,
        sortOrder: definition.sortOrder,
    }
}

/** Mirrors the server contract so autosave never sends a draft that would be rejected. */
export function isStateDefinitionSaveable(draft: IllustrationStateDefinitionInput): boolean {
    return (
        /^[\w-]+$/.test(draft.key) &&
        Boolean(draft.label.trim()) &&
        (draft.kind !== 'choice' ||
            (draft.options.length > 0 && draft.options.every((option) => option.value.trim())))
    )
}

export function continuityDraftFrom(view: ConversationContinuity): ContinuityUpdate {
    const { turn: _turn, ...draft } = structuredClone(view.state)
    return draft
}

/**
 * Sets or clears one state by hand. A value set by hand gets the definition's lifetime from
 * the current turn; clearing removes it.
 */
export function withStateValue(
    draft: ContinuityUpdate,
    actorId: string,
    definition: IllustrationStateDefinition,
    value: IllustrationStateValue['value'] | null,
    turn: number,
): ContinuityUpdate {
    const values = { ...draft.states[actorId] }
    if (value === null) delete values[definition.key]
    else {
        values[definition.key] = definition.lifetimeTurns
            ? { value, expiresAfterTurn: turn + definition.lifetimeTurns - 1 }
            : { value }
    }
    const states = { ...draft.states, [actorId]: values }
    if (!Object.keys(values).length) delete states[actorId]
    return { ...draft, states }
}

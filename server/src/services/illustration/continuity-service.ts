import type {
    ContinuityUpdate,
    ConversationContinuity,
    IllustrationActor,
    IllustrationOutfit,
    IllustrationState,
    IllustrationStateDefinition,
} from '@malang/shared'

import type { StateSnapshotRecord, Store } from '@/db'
import { NotFoundError, ValidationError } from '@/lib/errors/app-error'
import type { RuntimeEventHub } from '@/services/app/runtime-events'

import type { AnalysisPlan } from './analysis'
import { type ContinuityDelta, pruneState } from './continuity'

interface ConversationRef {
    id: string
    characterId: string
    personaLocked: boolean
    boundPersonaId: string | null
}

export interface Cast {
    /** Every actor of the conversation, enabled or not. */
    actors: IllustrationActor[]
    definitions: IllustrationStateDefinition[]
}

export interface EffectiveSnapshot extends StateSnapshotRecord {
    state: IllustrationState
}

/**
 * Snapshots belong to one output of one message. The current state is the snapshot of the
 * latest message whose shown output has one, so regenerating, switching outputs or
 * deleting a message falls back to the earlier state on its own.
 */
export class ContinuityService {
    constructor(
        private readonly store: Store,
        private readonly events: RuntimeEventHub,
    ) {}

    cast(conversation: ConversationRef): Cast {
        const personaId = conversation.personaLocked
            ? conversation.boundPersonaId
            : this.store.settings.get().selectedPersonaId
        return {
            actors: [
                ...this.store.illustrationActor.listForConversation(
                    { characterId: conversation.characterId },
                    conversation.id,
                ),
                ...(personaId
                    ? this.store.illustrationActor.listForConversation(
                          { personaId },
                          conversation.id,
                      )
                    : []),
            ],
            definitions: this.store.illustrationStateDefinition.listApplicable(
                conversation.characterId,
            ),
        }
    }

    /** The state in effect before the message at `beforePosition`, or now when omitted. */
    snapshotAt(conversationId: string, beforePosition?: number): EffectiveSnapshot | null {
        const snapshots = this.store.illustrationSnapshot.listForConversation(conversationId)
        if (!snapshots.length) return null
        const byMessage = Map.groupBy(snapshots, (snapshot) => snapshot.messageId)
        const messages = this.store.message
            .list(conversationId)
            .filter((message) => beforePosition === undefined || message.position < beforePosition)
        for (const message of messages.reverse()) {
            const candidates = byMessage.get(message.id)
            if (!candidates) continue
            const shown = new Set(
                this.store.generation
                    .listByMessage(message.id)
                    .filter(
                        (run) =>
                            run.status === 'complete' &&
                            (run.processedOutputText || run.outputText) === message.content,
                    )
                    .map((run) => run.id),
            )
            // Text edited by hand matches no output; its latest snapshot still applies.
            const match = shown.size
                ? candidates.findLast(
                      (snapshot) => snapshot.generationRunId && shown.has(snapshot.generationRunId),
                  )
                : candidates.at(-1)
            if (match) return match
        }
        return null
    }

    /** Assistant responses up to and including the message at `position`. */
    turnAt(conversationId: string, position: number): number {
        return this.store.message
            .list(conversationId)
            .filter((message) => message.role === 'assistant' && message.position <= position)
            .length
    }

    view(conversationId: string): ConversationContinuity {
        const conversation = this.requireConversation(conversationId)
        const cast = this.cast(conversation)
        const snapshot = this.snapshotAt(conversationId)
        return {
            state: snapshot ? this.prune(snapshot.state, cast) : this.emptyState(conversationId),
            source: snapshot?.source ?? null,
            snapshotMessageId: snapshot?.messageId ?? null,
            actors: cast.actors,
            definitions: cast.definitions,
        }
    }

    save(input: {
        conversationId: string
        messageId: string
        generationRunId: string | null
        state: IllustrationState
        source: 'analysis' | 'manual'
    }): void {
        this.store.illustrationSnapshot.save(input)
    }

    publish(conversationId: string): void {
        this.events.publish({
            type: 'runtime.event',
            name: 'continuity.updated',
            data: { conversationId },
        })
    }

    /** Stores a hand-edited state on the latest message, replacing what was there. */
    saveManual(conversationId: string, update: ContinuityUpdate): ConversationContinuity {
        const conversation = this.requireConversation(conversationId)
        const latest = this.store.message.list(conversationId).at(-1)
        if (!latest)
            throw new ValidationError('The conversation has no message to attach the state to')
        const cast = this.cast(conversation)
        this.validate(update, cast)
        this.save({
            conversationId,
            messageId: latest.id,
            generationRunId:
                this.store.generation.currentRun(latest.id, latest.content)?.id ?? null,
            state: { ...update, turn: this.turnAt(conversationId, latest.position) },
            source: 'manual',
        })
        this.publish(conversationId)
        return this.view(conversationId)
    }

    promoteOutfit(outfitId: string): IllustrationOutfit {
        const outfit = this.store.illustrationActor.getOutfit(outfitId)
        if (!outfit) throw new NotFoundError('Outfit not found')
        if (!outfit.conversationId) throw new ValidationError('The outfit is already registered')
        const promoted = this.store.illustrationActor.promoteOutfit(outfitId)!
        this.publish(outfit.conversationId)
        return promoted
    }

    prune(state: IllustrationState, cast: Cast): IllustrationState {
        return pruneState(
            state,
            new Set(cast.actors.map((actor) => actor.id)),
            new Set(cast.actors.flatMap((actor) => actor.outfits.map((outfit) => outfit.id))),
        )
    }

    /**
     * Turns the analysis AI's continuity report into a delta on actor ids. Invented outfits
     * become conversation-only outfits, unless the actor's outfit is locked.
     */
    resolveDelta(
        conversationId: string,
        continuity: AnalysisPlan['continuity'],
        actorsByRef: Map<string, IllustrationActor>,
        previous: IllustrationState | null,
    ): { delta: ContinuityDelta; warnings: string[] } {
        const warnings: string[] = []
        const actorId = (ref: string) => {
            const actor = actorsByRef.get(ref)
            if (!actor) warnings.push(`Ignored unknown actor "${ref}" in continuity`)
            return actor
        }
        const outfits: NonNullable<ContinuityDelta['outfits']> = []
        for (const change of continuity.outfits ?? []) {
            const actor = actorId(change.actor)
            if (!actor) continue
            const outfit = usableOutfits(actor).find(
                (item) => item.name.toLocaleLowerCase() === change.outfit.toLocaleLowerCase(),
            )
            if (!outfit) {
                warnings.push(`Ignored unknown outfit "${change.outfit}" for ${actor.name}`)
                continue
            }
            outfits.push({ actorId: actor.id, outfitId: outfit.id })
        }
        for (const invented of continuity.newOutfits ?? []) {
            const actor = actorId(invented.actor)
            if (!actor || !invented.tags.trim()) continue
            if (previous?.outfits[actor.id]?.locked) {
                warnings.push(`Kept the locked outfit of ${actor.name}`)
                continue
            }
            outfits.push({
                actorId: actor.id,
                outfitId: this.store.illustrationActor.upsertConversationOutfit({
                    actorId: actor.id,
                    conversationId,
                    name: invented.name.trim() || 'outfit',
                    prompt: invented.tags,
                }),
            })
        }
        const present = continuity.present
            ?.map((ref) => actorId(ref)?.id)
            .filter((id): id is string => Boolean(id))
        const states = (continuity.states ?? []).flatMap((change) => {
            const actor = actorId(change.actor)
            return actor ? [{ ...change, actorId: actor.id }] : []
        })
        return { delta: { present, outfits, states }, warnings }
    }

    /** The outfit an actor wears in `state`, else the actor's default outfit. */
    outfitOf(actor: IllustrationActor, state: IllustrationState | null): IllustrationOutfit | null {
        const outfits = usableOutfits(actor)
        const chosen = state?.outfits[actor.id]?.outfitId
        // An outfit invented by this analysis is not on the actor loaded before it.
        const fresh = chosen ? this.store.illustrationActor.getOutfit(chosen) : null
        const worn =
            (chosen ? outfits.find((outfit) => outfit.id === chosen) : undefined) ??
            (fresh?.actorId === actor.id && fresh.enabled ? fresh : undefined)
        return worn ?? outfits.find((outfit) => outfit.isDefault && !outfit.conversationId) ?? null
    }

    private validate(update: ContinuityUpdate, cast: Cast): void {
        const actors = new Map(cast.actors.map((actor) => [actor.id, actor]))
        const definitions = new Map(
            cast.definitions.map((definition) => [definition.key, definition]),
        )
        for (const id of update.present) {
            if (!actors.has(id)) throw new ValidationError(`Unknown actor ${id}`)
        }
        for (const [id, outfit] of Object.entries(update.outfits)) {
            const actor = actors.get(id)
            if (!actor) throw new ValidationError(`Unknown actor ${id}`)
            if (outfit.outfitId && !actor.outfits.some((item) => item.id === outfit.outfitId)) {
                throw new ValidationError(`${actor.name} has no outfit ${outfit.outfitId}`)
            }
        }
        for (const [id, values] of Object.entries(update.states)) {
            if (!actors.has(id)) throw new ValidationError(`Unknown actor ${id}`)
            for (const [key, entry] of Object.entries(values)) {
                const definition = definitions.get(key)
                if (!definition) throw new ValidationError(`Undefined state "${key}"`)
                const valid =
                    definition.kind === 'flag'
                        ? entry.value === true
                        : definition.kind === 'counter'
                          ? typeof entry.value === 'number'
                          : definition.options.some((option) => option.value === entry.value)
                if (!valid) throw new ValidationError(`Invalid value for state "${key}"`)
            }
        }
    }

    private emptyState(conversationId: string): IllustrationState {
        const latest = this.store.message.list(conversationId).at(-1)
        return {
            present: [],
            outfits: {},
            states: {},
            turn: latest ? this.turnAt(conversationId, latest.position) : 0,
        }
    }

    private requireConversation(conversationId: string): ConversationRef {
        const conversation = this.store.conversation.get(conversationId)
        if (!conversation) throw new NotFoundError('Conversation not found')
        return conversation
    }
}

function usableOutfits(actor: IllustrationActor): IllustrationOutfit[] {
    return actor.outfits.filter((outfit) => outfit.enabled)
}

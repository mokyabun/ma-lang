import type {
    IllustrationActor,
    IllustrationActorInput,
    IllustrationActorOwner,
    IllustrationOutfit,
} from '@malang/shared'
import { and, asc, eq, inArray, isNull, max, or } from 'drizzle-orm'

import { illustrationActors, illustrationOutfits } from '../schema'
import { iso, RepositoryBase } from './base'

type ActorRow = typeof illustrationActors.$inferSelect
type OutfitRow = typeof illustrationOutfits.$inferSelect

export class IllustrationActorRepository extends RepositoryBase {
    list(owner: IllustrationActorOwner): IllustrationActor[] {
        const rows = this.db
            .select()
            .from(illustrationActors)
            .where(ownerCondition(owner))
            .orderBy(asc(illustrationActors.sortOrder), asc(illustrationActors.createdAt))
            .all()
        return this.withOutfits(rows)
    }

    /** Actors with their registered outfits plus the ones made for this conversation. */
    listForConversation(
        owner: IllustrationActorOwner,
        conversationId: string,
    ): IllustrationActor[] {
        const rows = this.db
            .select()
            .from(illustrationActors)
            .where(ownerCondition(owner))
            .orderBy(asc(illustrationActors.sortOrder), asc(illustrationActors.createdAt))
            .all()
        return this.withOutfits(rows, conversationId)
    }

    /** Reuses a conversation outfit with the same name instead of piling up copies. */
    upsertConversationOutfit(input: {
        actorId: string
        conversationId: string
        name: string
        prompt: string
    }): string {
        const existing = this.db
            .select({ id: illustrationOutfits.id })
            .from(illustrationOutfits)
            .where(
                and(
                    eq(illustrationOutfits.actorId, input.actorId),
                    eq(illustrationOutfits.conversationId, input.conversationId),
                    eq(illustrationOutfits.name, input.name),
                ),
            )
            .get()
        if (existing) {
            this.db
                .update(illustrationOutfits)
                .set({ prompt: input.prompt })
                .where(eq(illustrationOutfits.id, existing.id))
                .run()
            return existing.id
        }
        const id = crypto.randomUUID()
        this.db
            .insert(illustrationOutfits)
            .values({
                id,
                actorId: input.actorId,
                conversationId: input.conversationId,
                name: input.name,
                prompt: input.prompt,
                negative: '',
                sortOrder: 1_000,
            })
            .run()
        return id
    }

    /** Makes a conversation-only outfit available to every conversation. */
    promoteOutfit(outfitId: string): IllustrationOutfit | null {
        const row = this.db
            .update(illustrationOutfits)
            .set({ conversationId: null })
            .where(eq(illustrationOutfits.id, outfitId))
            .returning()
            .get()
        return row ? mapOutfit(row) : null
    }

    getOutfit(outfitId: string): IllustrationOutfit | null {
        const row = this.db
            .select()
            .from(illustrationOutfits)
            .where(eq(illustrationOutfits.id, outfitId))
            .get()
        return row ? mapOutfit(row) : null
    }

    get(id: string): IllustrationActor | null {
        const row = this.db
            .select()
            .from(illustrationActors)
            .where(eq(illustrationActors.id, id))
            .get()
        return row ? (this.withOutfits([row])[0] ?? null) : null
    }

    create(owner: IllustrationActorOwner, input: IllustrationActorInput): IllustrationActor {
        const id = crypto.randomUUID()
        this.sqlite.transaction(() => {
            const last = this.db
                .select({ value: max(illustrationActors.sortOrder) })
                .from(illustrationActors)
                .where(ownerCondition(owner))
                .get()?.value
            this.db
                .insert(illustrationActors)
                .values({
                    id,
                    characterId: 'characterId' in owner ? owner.characterId : null,
                    personaId: 'personaId' in owner ? owner.personaId : null,
                    ...actorColumns(input),
                    sortOrder: input.sortOrder ?? (last ?? -1) + 1,
                })
                .run()
            this.replaceOutfits(id, input.outfits)
        })()
        return this.get(id)!
    }

    update(id: string, input: IllustrationActorInput): IllustrationActor | null {
        const updated = this.sqlite.transaction(() => {
            const updated = this.db
                .update(illustrationActors)
                .set({
                    ...actorColumns(input),
                    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
                })
                .where(eq(illustrationActors.id, id))
                .returning({ id: illustrationActors.id })
                .get()
            if (!updated) return false
            this.replaceOutfits(id, input.outfits)
            return true
        })()
        return updated ? this.get(id) : null
    }

    delete(id: string): boolean {
        return !!this.db
            .delete(illustrationActors)
            .where(eq(illustrationActors.id, id))
            .returning({ id: illustrationActors.id })
            .get()
    }

    /** Replaces the registered outfits; conversation-only outfits are left alone. */
    private replaceOutfits(actorId: string, outfits: IllustrationActorInput['outfits']): void {
        const registered = and(
            eq(illustrationOutfits.actorId, actorId),
            isNull(illustrationOutfits.conversationId),
        )
        const existing = new Set(
            this.db
                .select({ id: illustrationOutfits.id })
                .from(illustrationOutfits)
                .where(registered)
                .all()
                .map((row) => row.id),
        )
        const kept = new Set<string>()
        for (const [sortOrder, outfit] of outfits.entries()) {
            const columns = {
                name: outfit.name,
                prompt: outfit.prompt,
                negative: outfit.negative,
                isDefault: outfit.isDefault,
                enabled: outfit.enabled,
                sortOrder,
            }
            // An id from another actor or a conversation outfit is treated as new.
            if (outfit.id && existing.has(outfit.id)) {
                kept.add(outfit.id)
                this.db
                    .update(illustrationOutfits)
                    .set(columns)
                    .where(eq(illustrationOutfits.id, outfit.id))
                    .run()
                continue
            }
            this.db
                .insert(illustrationOutfits)
                .values({ id: crypto.randomUUID(), actorId, conversationId: null, ...columns })
                .run()
        }
        const removed = [...existing].filter((id) => !kept.has(id))
        if (removed.length) {
            this.db
                .delete(illustrationOutfits)
                .where(inArray(illustrationOutfits.id, removed))
                .run()
        }
    }

    private withOutfits(rows: ActorRow[], conversationId?: string): IllustrationActor[] {
        if (!rows.length) return []
        const outfits = this.db
            .select()
            .from(illustrationOutfits)
            .where(
                and(
                    inArray(
                        illustrationOutfits.actorId,
                        rows.map((row) => row.id),
                    ),
                    conversationId
                        ? or(
                              isNull(illustrationOutfits.conversationId),
                              eq(illustrationOutfits.conversationId, conversationId),
                          )
                        : isNull(illustrationOutfits.conversationId),
                ),
            )
            .orderBy(asc(illustrationOutfits.sortOrder))
            .all()
            .map(mapOutfit)
        return rows.map((row) =>
            mapActor(
                row,
                outfits.filter((outfit) => outfit.actorId === row.id),
            ),
        )
    }
}

function ownerCondition(owner: IllustrationActorOwner) {
    return 'characterId' in owner
        ? eq(illustrationActors.characterId, owner.characterId)
        : eq(illustrationActors.personaId, owner.personaId)
}

function actorColumns(input: IllustrationActorInput) {
    return {
        name: input.name,
        keysJson: input.keys,
        promptTemplate: input.promptTemplate,
        negative: input.negative,
        enabled: input.enabled,
    }
}

function mapActor(row: ActorRow, outfits: IllustrationOutfit[]): IllustrationActor {
    return {
        id: row.id,
        characterId: row.characterId,
        personaId: row.personaId,
        name: row.name,
        keys: row.keysJson,
        promptTemplate: row.promptTemplate,
        negative: row.negative,
        enabled: row.enabled,
        sortOrder: row.sortOrder,
        outfits,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

function mapOutfit(row: OutfitRow): IllustrationOutfit {
    return {
        id: row.id,
        actorId: row.actorId,
        conversationId: row.conversationId,
        name: row.name,
        prompt: row.prompt,
        negative: row.negative,
        isDefault: row.isDefault,
        enabled: row.enabled,
        sortOrder: row.sortOrder,
    }
}

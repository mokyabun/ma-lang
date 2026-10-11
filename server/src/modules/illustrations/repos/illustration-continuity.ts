import type {
    IllustrationState,
    IllustrationStateDefinition,
    IllustrationStateDefinitionInput,
} from '@malang/shared'
import { and, asc, eq, isNull, max, or } from 'drizzle-orm'

import { iso, RepositoryBase } from '@/db/repository'
import { illustrationStateDefinitions, illustrationStateSnapshots } from '@/db/schema'

type DefinitionRow = typeof illustrationStateDefinitions.$inferSelect

export interface StateSnapshotRecord {
    id: string
    messageId: string
    generationRunId: string | null
    state: IllustrationState
    source: 'analysis' | 'manual'
}

export class IllustrationStateDefinitionRepository extends RepositoryBase {
    /** Definitions of one scope: a character's, or the global ones for null. */
    list(characterId: string | null): IllustrationStateDefinition[] {
        return this.db
            .select()
            .from(illustrationStateDefinitions)
            .where(
                characterId
                    ? eq(illustrationStateDefinitions.characterId, characterId)
                    : isNull(illustrationStateDefinitions.characterId),
            )
            .orderBy(
                asc(illustrationStateDefinitions.sortOrder),
                asc(illustrationStateDefinitions.createdAt),
            )
            .all()
            .map(mapDefinition)
    }

    /** Global definitions, then the character's, which win on a shared key. */
    listApplicable(characterId: string): IllustrationStateDefinition[] {
        const rows = this.db
            .select()
            .from(illustrationStateDefinitions)
            .where(
                or(
                    isNull(illustrationStateDefinitions.characterId),
                    eq(illustrationStateDefinitions.characterId, characterId),
                ),
            )
            .orderBy(
                asc(illustrationStateDefinitions.sortOrder),
                asc(illustrationStateDefinitions.createdAt),
            )
            .all()
            .map(mapDefinition)
        const byKey = new Map<string, IllustrationStateDefinition>()
        for (const row of rows.filter((item) => !item.characterId)) byKey.set(row.key, row)
        for (const row of rows.filter((item) => item.characterId)) byKey.set(row.key, row)
        return [...byKey.values()]
    }

    get(id: string): IllustrationStateDefinition | null {
        const row = this.db
            .select()
            .from(illustrationStateDefinitions)
            .where(eq(illustrationStateDefinitions.id, id))
            .get()
        return row ? mapDefinition(row) : null
    }

    findKey(characterId: string | null, key: string): IllustrationStateDefinition | null {
        return this.list(characterId).find((definition) => definition.key === key) ?? null
    }

    create(
        characterId: string | null,
        input: IllustrationStateDefinitionInput,
    ): IllustrationStateDefinition {
        const last = this.db
            .select({ value: max(illustrationStateDefinitions.sortOrder) })
            .from(illustrationStateDefinitions)
            .where(
                characterId
                    ? eq(illustrationStateDefinitions.characterId, characterId)
                    : isNull(illustrationStateDefinitions.characterId),
            )
            .get()?.value
        const row = this.db
            .insert(illustrationStateDefinitions)
            .values({
                id: crypto.randomUUID(),
                characterId,
                ...definitionColumns(input),
                sortOrder: input.sortOrder ?? (last ?? -1) + 1,
            })
            .returning()
            .get()
        return mapDefinition(row)
    }

    update(
        id: string,
        input: IllustrationStateDefinitionInput,
    ): IllustrationStateDefinition | null {
        const row = this.db
            .update(illustrationStateDefinitions)
            .set({
                ...definitionColumns(input),
                ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
            })
            .where(eq(illustrationStateDefinitions.id, id))
            .returning()
            .get()
        return row ? mapDefinition(row) : null
    }

    delete(id: string): boolean {
        return !!this.db
            .delete(illustrationStateDefinitions)
            .where(eq(illustrationStateDefinitions.id, id))
            .returning({ id: illustrationStateDefinitions.id })
            .get()
    }
}

export class IllustrationSnapshotRepository extends RepositoryBase {
    listForConversation(conversationId: string): StateSnapshotRecord[] {
        return this.db
            .select()
            .from(illustrationStateSnapshots)
            .where(eq(illustrationStateSnapshots.conversationId, conversationId))
            .orderBy(asc(illustrationStateSnapshots.updatedAt))
            .all()
            .map((row) => ({
                id: row.id,
                messageId: row.messageId,
                generationRunId: row.generationRunId,
                state: row.stateJson,
                source: row.source,
            }))
    }

    /** One snapshot per message output; saving again replaces it. */
    save(input: {
        conversationId: string
        messageId: string
        generationRunId: string | null
        state: IllustrationState
        source: 'analysis' | 'manual'
    }): void {
        this.sqlite.transaction(() => {
            this.db
                .delete(illustrationStateSnapshots)
                .where(
                    and(
                        eq(illustrationStateSnapshots.messageId, input.messageId),
                        input.generationRunId
                            ? eq(illustrationStateSnapshots.generationRunId, input.generationRunId)
                            : isNull(illustrationStateSnapshots.generationRunId),
                    ),
                )
                .run()
            this.db
                .insert(illustrationStateSnapshots)
                .values({
                    id: crypto.randomUUID(),
                    conversationId: input.conversationId,
                    messageId: input.messageId,
                    generationRunId: input.generationRunId,
                    stateJson: input.state,
                    source: input.source,
                })
                .run()
        })()
    }
}

function definitionColumns(input: IllustrationStateDefinitionInput) {
    return {
        key: input.key,
        label: input.label,
        instruction: input.instruction,
        kind: input.kind,
        tags: input.tags,
        optionsJson: input.options,
        thresholdsJson: input.thresholds,
        lifetimeTurns: input.lifetimeTurns,
    }
}

function mapDefinition(row: DefinitionRow): IllustrationStateDefinition {
    return {
        id: row.id,
        characterId: row.characterId,
        key: row.key,
        label: row.label,
        instruction: row.instruction,
        kind: row.kind,
        tags: row.tags,
        options: row.optionsJson,
        thresholds: row.thresholdsJson,
        lifetimeTurns: row.lifetimeTurns,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

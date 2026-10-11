import type { IllustrationStyle, IllustrationStyleInput } from '@malang/shared'
import { asc, eq, max } from 'drizzle-orm'

import { iso, RepositoryBase } from '@/db/repository'
import { illustrationSettings, illustrationStyles } from '@/db/schema'

type StyleRow = typeof illustrationStyles.$inferSelect

export class IllustrationStyleRepository extends RepositoryBase {
    list(): IllustrationStyle[] {
        return this.db
            .select()
            .from(illustrationStyles)
            .orderBy(asc(illustrationStyles.sortOrder), asc(illustrationStyles.createdAt))
            .all()
            .map(mapStyle)
    }

    get(id: string): IllustrationStyle | null {
        const row = this.db
            .select()
            .from(illustrationStyles)
            .where(eq(illustrationStyles.id, id))
            .get()
        return row ? mapStyle(row) : null
    }

    create(input: IllustrationStyleInput): IllustrationStyle {
        const last = this.db
            .select({ value: max(illustrationStyles.sortOrder) })
            .from(illustrationStyles)
            .get()?.value
        const row = this.db
            .insert(illustrationStyles)
            .values({
                id: crypto.randomUUID(),
                name: input.name,
                sceneTemplate: input.sceneTemplate,
                negative: input.negative,
                paramsJson: input.params,
                sortOrder: input.sortOrder ?? (last ?? -1) + 1,
            })
            .returning()
            .get()
        return mapStyle(row)
    }

    update(id: string, input: IllustrationStyleInput): IllustrationStyle | null {
        const row = this.db
            .update(illustrationStyles)
            .set({
                name: input.name,
                sceneTemplate: input.sceneTemplate,
                negative: input.negative,
                paramsJson: input.params,
                ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
            })
            .where(eq(illustrationStyles.id, id))
            .returning()
            .get()
        return row ? mapStyle(row) : null
    }

    delete(id: string): boolean {
        return this.sqlite.transaction(() => {
            this.db
                .update(illustrationSettings)
                .set({ defaultStyleId: null })
                .where(eq(illustrationSettings.defaultStyleId, id))
                .run()
            return !!this.db
                .delete(illustrationStyles)
                .where(eq(illustrationStyles.id, id))
                .returning({ id: illustrationStyles.id })
                .get()
        })()
    }
}

function mapStyle(row: StyleRow): IllustrationStyle {
    return {
        id: row.id,
        name: row.name,
        sceneTemplate: row.sceneTemplate,
        negative: row.negative,
        params: row.paramsJson,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

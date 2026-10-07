import type { CharacterGroup } from '@malang/shared'
import { asc, eq } from 'drizzle-orm'

import { characterGroups } from '../schema'
import { iso, RepositoryBase, requireValue } from './base'

export class CharacterGroupRepository extends RepositoryBase {
    list(): CharacterGroup[] {
        return this.db
            .select()
            .from(characterGroups)
            .orderBy(asc(characterGroups.sortOrder), asc(characterGroups.createdAt))
            .all()
            .map(mapCharacterGroup)
    }

    create(name: string, sortOrder: number): CharacterGroup {
        const now = new Date()
        const id = crypto.randomUUID()
        this.db
            .insert(characterGroups)
            .values({
                id,
                name,
                sortOrder,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(
            this.list().find((group) => group.id === id),
            'Failed to create character group',
        )
    }

    update(id: string, name: string): CharacterGroup | null {
        const existing = this.db
            .select()
            .from(characterGroups)
            .where(eq(characterGroups.id, id))
            .get()
        if (!existing) return null
        this.db.update(characterGroups).set({ name }).where(eq(characterGroups.id, id)).run()
        return this.list().find((group) => group.id === id) ?? null
    }

    delete(id: string): boolean {
        const existing = this.db
            .select({ id: characterGroups.id })
            .from(characterGroups)
            .where(eq(characterGroups.id, id))
            .get()
        if (!existing) return false
        this.db.delete(characterGroups).where(eq(characterGroups.id, id)).run()
        return true
    }
}

function mapCharacterGroup(row: typeof characterGroups.$inferSelect): CharacterGroup {
    return {
        id: row.id,
        name: row.name,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

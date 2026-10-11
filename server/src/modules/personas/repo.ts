import type { Persona, PersonaCreate, PersonaUpdate } from '@malang/shared'
import { asc, eq } from 'drizzle-orm'

import { iso, RepositoryBase } from '@/db/repository'
import { conversations, personas } from '@/db/schema'

export class PersonaRepository extends RepositoryBase {
    list(): Persona[] {
        return this.db
            .select()
            .from(personas)
            .orderBy(asc(personas.createdAt))
            .all()
            .map(mapPersona)
    }

    get(id: string): Persona | null {
        const row = this.db.select().from(personas).where(eq(personas.id, id)).get()
        return row ? mapPersona(row) : null
    }

    create(input: PersonaCreate): Persona {
        const now = new Date()
        const row = {
            id: crypto.randomUUID(),
            name: input.name,
            description: input.description,
            note: input.note,
            avatarAssetId: null,
            createdAt: now,
            updatedAt: now,
        }
        this.db.insert(personas).values(row).run()
        return mapPersona(row)
    }

    update(id: string, update: PersonaUpdate): Persona | null {
        const current = this.get(id)
        if (!current) return null
        this.db
            .update(personas)
            .set({
                name: update.name ?? current.name,
                description: update.description ?? current.description,
                note: update.note ?? current.note,
            })
            .where(eq(personas.id, id))
            .run()
        return this.get(id)
    }

    delete(id: string): boolean {
        if (!this.get(id)) return false
        this.db
            .update(conversations)
            .set({ personaLocked: false })
            .where(eq(conversations.boundPersonaId, id))
            .run()
        this.db.delete(personas).where(eq(personas.id, id)).run()
        return true
    }

    setAvatar(id: string, assetId: string | null): Persona | null {
        const current = this.get(id)
        if (!current) return null
        this.db.update(personas).set({ avatarAssetId: assetId }).where(eq(personas.id, id)).run()
        return this.get(id)
    }
}

function mapPersona(row: typeof personas.$inferSelect): Persona {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        note: row.note,
        avatarAssetId: row.avatarAssetId,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

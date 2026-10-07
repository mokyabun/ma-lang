import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { eq } from 'drizzle-orm'

import { openDatabase } from '@/db'
import journal from '@/db/migrations/meta/_journal.json'
import * as schema from '@/db/schema'
import { adminUsers } from '@/db/schema'

describe('database baseline', () => {
    test('has a generated migration for every schema.ts change', async () => {
        const latest = journal.entries.at(-1)!
        const snapshot = JSON.parse(
            readFileSync(
                join(
                    import.meta.dir,
                    `../../src/db/migrations/meta/${latest.tag.slice(0, 4)}_snapshot.json`,
                ),
                'utf8',
            ),
        )
        const current = await generateSQLiteDrizzleJson(schema)
        // Non-empty means schema.ts changed without `bun run db:generate`.
        expect(await generateSQLiteMigration(snapshot, current)).toEqual([])
    })

    test('applies all migrations without deprecated columns', () => {
        const handle = openDatabase(':memory:')
        try {
            const columns = (table: string) =>
                handle.sqlite
                    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
                    .all()
                    .map((column) => column.name)

            expect(
                handle.sqlite
                    .query<{ version: number }, []>(
                        'SELECT version FROM schema_migrations ORDER BY version',
                    )
                    .all(),
            ).toEqual(journal.entries.map((entry) => ({ version: entry.idx + 1 })))
            expect(columns('app_settings')).not.toContain('persona')
            expect(columns('conversations')).not.toContain('toggles_json')
            expect(columns('model_chain_presets')).toContain('config_json')
            expect(columns('model_chain_presets')).not.toContain('steps_json')

            // These store current toggle declarations, not deprecated conversation values.
            expect(columns('prompt_presets')).toContain('toggles_json')
            expect(columns('prompt_modules')).toContain('toggles_json')
        } finally {
            handle.close()
        }
    })

    test('maps millisecond timestamps to Date and updates updatedAt automatically', () => {
        const handle = openDatabase(':memory:')
        try {
            handle.db
                .insert(adminUsers)
                .values({ id: 'timestamp-test', passwordHash: 'before' })
                .run()

            const created = handle.db.select().from(adminUsers).get()
            expect(created?.createdAt).toBeInstanceOf(Date)
            expect(created?.updatedAt).toBeInstanceOf(Date)

            handle.sqlite.run("UPDATE admin_users SET updated_at = 1 WHERE id = 'timestamp-test'")
            handle.db
                .update(adminUsers)
                .set({ passwordHash: 'after' })
                .where(eq(adminUsers.id, 'timestamp-test'))
                .run()

            const updated = handle.db.select().from(adminUsers).get()
            expect(updated?.updatedAt).toBeInstanceOf(Date)
            expect(updated!.updatedAt.getTime()).toBeGreaterThan(1)

            const stored = handle.sqlite
                .query<{ createdAt: number; updatedAt: number }, []>(
                    'SELECT created_at AS createdAt, updated_at AS updatedAt FROM admin_users',
                )
                .get()
            expect(typeof stored?.createdAt).toBe('number')
            expect(typeof stored?.updatedAt).toBe('number')
        } finally {
            handle.close()
        }
    })
})

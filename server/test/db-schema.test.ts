import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { eq } from 'drizzle-orm'

import { openDatabase } from '../src/db'
import { runMigrations } from '../src/db/migrate'
import { adminUsers } from '../src/db/schema'

describe('database baseline', () => {
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
            ).toEqual([{ version: 1 }, { version: 2 }])
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

    test('repairs MIME types of assets imported before their extension was known', () => {
        const sqlite = new Database(':memory:', { strict: true })
        try {
            sqlite.exec(
                readFileSync(
                    join(import.meta.dir, '../src/db/migrations/0000_initial.sql'),
                    'utf8',
                ),
            )
            sqlite.exec(`
                CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
                INSERT INTO schema_migrations VALUES (1, 0);
                INSERT INTO assets (id, sha256, mime_type, size, path) VALUES
                    ('avif', 'a', 'application/octet-stream', 1, 'a'),
                    ('unknown', 'b', 'application/octet-stream', 1, 'b'),
                    ('unlinked', 'c', 'application/octet-stream', 1, 'c');
                INSERT INTO prompt_module_assets (id, module_id, asset_id, type, name, extension, source_uri)
                    VALUES ('l1', 'm', 'avif', 'other', 'x', 'AVIF', 'risum:0');
                INSERT INTO character_assets (id, character_id, asset_id, type, name, extension, source_uri)
                    VALUES ('l2', 'c', 'unknown', 'other', 'y', 'xyz', 'embeded://y');
            `)

            runMigrations(sqlite)

            expect(
                sqlite
                    .query<{ id: string; mime: string }, []>(
                        'SELECT id, mime_type AS mime FROM assets ORDER BY id',
                    )
                    .all(),
            ).toEqual([
                { id: 'avif', mime: 'image/avif' },
                { id: 'unknown', mime: 'application/octet-stream' },
                { id: 'unlinked', mime: 'application/octet-stream' },
            ])
        } finally {
            sqlite.close()
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

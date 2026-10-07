import type { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'

import { bundledFilePath } from '@/utils'

import InitialMigration from './migrations/0000_initial.sql' with { type: 'file' }
import AddBiasMigration from './migrations/0001_add_bias.sql' with { type: 'file' }
import BackfillBiasMigration from './migrations/0002_backfill_bias.sql' with { type: 'file' }
import journal from './migrations/meta/_journal.json'

// Bundled builds embed only static imports: register each generated migration here.
const migrationFiles: Record<string, string> = {
    '0000_initial': InitialMigration,
    '0001_add_bias': AddBiasMigration,
    '0002_backfill_bias': BackfillBiasMigration,
}

const migrations = journal.entries.map((entry) => {
    const path = migrationFiles[entry.tag]
    if (!path) throw new Error(`Migration ${entry.tag} is not registered in migrate.ts`)
    return { version: entry.idx + 1, path }
})

export function runMigrations(sqlite: Database): void {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )
    `)

    const applied = new Set(
        sqlite
            .query<{ version: number }, []>('SELECT version FROM schema_migrations')
            .all()
            .map((row) => row.version),
    )

    for (const migration of migrations) {
        if (applied.has(migration.version)) continue

        const statements = readFileSync(bundledFilePath(migration.path), 'utf8')
        sqlite.transaction(() => {
            sqlite.exec(statements)
            sqlite
                .query('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
                .run(migration.version, Date.now())
        })()
    }
}

import type { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import InitialMigration from './migrations/0000_initial.sql' with { type: 'file' }
import journal from './migrations/meta/_journal.json'

// Bundled builds embed only static imports: register each generated migration here.
const migrationFiles: Record<string, string> = {
    '0000_initial': InitialMigration,
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

        const statements = readFileSync(resolveMigrationPath(migration.path), 'utf8')
        sqlite.transaction(() => {
            sqlite.exec(statements)
            sqlite
                .query('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
                .run(migration.version, Date.now())
        })()
    }
}

function resolveMigrationPath(path: string) {
    if (path.startsWith('$bunfs/') || isAbsolute(path)) return path
    return join(import.meta.dir, path)
}

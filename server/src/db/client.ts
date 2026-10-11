import { Database } from 'bun:sqlite'
import { chmodSync, copyFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'

import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite'

import { runMigrations } from './migrate'
import * as schema from './schema'

export interface DatabaseHandle {
    sqlite: Database
    db: BunSQLiteDatabase<typeof schema>
    replaceWith(sourcePath: string, rollbackPath: string): void
    close(): void
}

export function openDatabase(path: string): DatabaseHandle {
    mkdirSync(dirname(path), { recursive: true })
    const open = () => {
        const sqlite = new Database(path, { create: true, strict: true })
        sqlite.run('PRAGMA foreign_keys = ON;')
        sqlite.run('PRAGMA journal_mode = WAL;')
        sqlite.run('PRAGMA busy_timeout = 5000;')
        runMigrations(sqlite)
        return sqlite
    }
    const sqlite = open()
    const handle: DatabaseHandle = {
        sqlite,
        db: drizzle(sqlite, { schema }),
        replaceWith(sourcePath, rollbackPath) {
            const staged = `${path}.restore-${crypto.randomUUID()}.tmp`
            copyFileSync(sourcePath, staged)
            chmodSync(staged, 0o600)
            handle.sqlite.close()
            removeSidecars(path)
            renameSync(staged, path)
            try {
                handle.sqlite = open()
            } catch (error) {
                copyFileSync(rollbackPath, staged)
                chmodSync(staged, 0o600)
                removeSidecars(path)
                renameSync(staged, path)
                handle.sqlite = open()
                handle.db = drizzle(handle.sqlite, { schema })
                throw error
            }
            handle.db = drizzle(handle.sqlite, { schema })
        },
        close: () => handle.sqlite.close(),
    }
    return handle
}

function removeSidecars(path: string): void {
    for (const sidecar of [`${path}-wal`, `${path}-shm`]) {
        try {
            unlinkSync(sidecar)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
    }
}

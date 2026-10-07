import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    truncateSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadConfig } from '../src/config'
import { type DatabaseHandle, openDatabase, Store } from '../src/db'
import { createLogger } from '../src/logger'
import { BACKUP_MAX_BYTES, BackupService } from '../src/services/app/backups'

describe('automatic database backups', () => {
    let directory: string
    let database: DatabaseHandle
    let store: Store
    let backup: BackupService
    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'malang-backup-'))
        database = openDatabase(join(directory, 'data.sqlite'))
        store = new Store(database)
        store.settings.ensure()
        const config = loadConfig({ NODE_ENV: 'test', DATA_DIR: directory })
        backup = new BackupService(config, database, store, createLogger(config))
    })
    afterEach(() => {
        backup.close()
        database.close()
        rmSync(directory, { recursive: true, force: true })
    })
    const snapshots = () =>
        readdirSync(backup.directory)
            .filter((name) => name.endsWith('.sqlite'))
            .sort()

    test('creates a private, consistent snapshot including WAL writes and skips unchanged data', () => {
        expect(store.settings.get().autoBackupEnabled).toBe(true)
        store.settings.update({ userName: 'WAL snapshot' })
        backup.start()
        backup.run()
        expect(snapshots()).toHaveLength(1)
        const path = join(backup.directory, snapshots()[0]!)
        expect(statSync(path).mode & 0o777).toBe(0o600)
        const restored = new Database(path, { readonly: true })
        try {
            expect(restored.query('PRAGMA integrity_check').get()).toEqual({
                integrity_check: 'ok',
            })
            expect(restored.query('SELECT user_name FROM app_settings').get()).toEqual({
                user_name: 'WAL snapshot',
            })
        } finally {
            restored.close()
        }
        store.settings.update({ userName: 'Changed' })
        backup.run()
        expect(snapshots()).toHaveLength(2)
    })

    test('settings opt-out persists and preserves existing snapshots; re-enable resumes', () => {
        backup.run()
        store.settings.update({ autoBackupEnabled: false })
        backup.run()
        expect(snapshots()).toHaveLength(1)
        const reopened = openDatabase(join(directory, 'data.sqlite'))
        try {
            expect(new Store(reopened).settings.get().autoBackupEnabled).toBe(false)
        } finally {
            reopened.close()
        }
        store.settings.update({ autoBackupEnabled: true })
        backup.run()
        expect(snapshots()).toHaveLength(2)
    })

    test('lists, restores, and deletes user snapshots with a restore safety point', () => {
        store.settings.update({ userName: 'Saved state' })
        const manual = backup.create()
        expect(backup.list()).toContainEqual(manual)

        store.settings.update({ userName: 'Current state' })
        const result = backup.restore(manual.id)
        expect(result.restored.id).toBe(manual.id)
        expect(result.safetySnapshot.kind).toBe('beforeRestore')
        expect(store.settings.get().userName).toBe('Saved state')

        const safety = new Database(join(backup.directory, result.safetySnapshot.id), {
            readonly: true,
        })
        try {
            expect(safety.query('SELECT user_name FROM app_settings').get()).toEqual({
                user_name: 'Current state',
            })
        } finally {
            safety.close()
        }

        expect(backup.delete(manual.id)).toBe(true)
        expect(backup.delete(manual.id)).toBe(false)
        expect(backup.file('../data.sqlite')).toBeNull()
    })

    test('environment opt-out overrides enabled settings without creating a directory', () => {
        const config = loadConfig({
            NODE_ENV: 'test',
            DATA_DIR: directory,
            AUTO_BACKUP_ENABLED: 'false',
        })
        const disabled = new BackupService(config, database, store, createLogger(config))
        disabled.start()
        disabled.run()
        disabled.close()
        expect(existsSync(disabled.directory)).toBe(false)
    })

    test('rotates only automatic snapshots by count and bytes, always keeping the latest', () => {
        mkdirSync(backup.directory)
        for (let index = 0; index < 25; index++) {
            writeFileSync(
                join(
                    backup.directory,
                    `auto-${1000000000000 + index}-${crypto.randomUUID()}.sqlite`,
                ),
                '',
            )
        }
        const manual = join(backup.directory, 'manual.sqlite')
        writeFileSync(manual, 'manual backup')
        backup.run()
        expect(snapshots()).toHaveLength(21)
        expect(existsSync(manual)).toBe(true)
        const newest = snapshots()
            .filter((name) => name.startsWith('auto-'))
            .at(-1)!
        truncateSync(join(backup.directory, newest), BACKUP_MAX_BYTES + 1)
        store.settings.update({ userName: 'Next' })
        backup.run()
        expect(existsSync(join(backup.directory, newest))).toBe(false)
        expect(existsSync(manual)).toBe(true)
    })

    test('a filesystem failure does not throw or prevent a later retry', () => {
        writeFileSync(backup.directory, 'blocked')
        expect(() => backup.run()).not.toThrow()
        renameSync(backup.directory, join(directory, 'blocked'))
        backup.run()
        expect(snapshots()).toHaveLength(1)
        expect(readdirSync(backup.directory).some((name) => name.endsWith('.tmp'))).toBe(false)
    })
})

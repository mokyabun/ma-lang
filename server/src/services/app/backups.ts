import { Database } from 'bun:sqlite'
import {
    chmodSync,
    mkdirSync,
    readdirSync,
    renameSync,
    rmdirSync,
    statSync,
    unlinkSync,
} from 'node:fs'
import { basename, join } from 'node:path'

import type { Logger } from 'pino'

import type { AppConfig } from '@/config'
import type { DatabaseHandle, Store } from '@/db'
import { ConflictError, NotFoundError, ValidationError } from '@/errors'

export const BACKUP_INTERVAL_MS = 5 * 60 * 1000
export const BACKUP_MAX_COUNT = 20
export const BACKUP_MAX_BYTES = 500 * 1024 * 1024
const AUTO_BACKUP_NAME = /^auto-(\d{13})-[0-9a-f-]{36}\.sqlite$/
const MANUAL_BACKUP_NAME = /^manual-(\d{13})-[0-9a-f-]{36}\.sqlite$/
const SAFETY_BACKUP_NAME = /^before-restore-(\d{13})-[0-9a-f-]{36}\.sqlite$/
const MANAGED_BACKUP_NAME = /^(?:auto|manual|before-restore)-\d{13}-[0-9a-f-]{36}\.sqlite$/

export interface BackupSnapshot {
    id: string
    createdAt: number
    size: number
    kind: 'automatic' | 'manual' | 'beforeRestore'
}

/** Independent SQLite snapshots; assets remain in DATA_DIR/assets. */
export class BackupService {
    private timer: ReturnType<typeof setInterval> | undefined
    private revision = ''
    readonly directory: string

    constructor(
        private readonly config: AppConfig,
        private readonly database: DatabaseHandle,
        private readonly store: Store,
        private readonly logger: Logger,
        private readonly afterRestore: () => void = () => undefined,
    ) {
        this.directory = join(config.dataDir, 'backups')
    }

    start(): void {
        if (this.timer || !this.config.autoBackupEnabled) return
        this.run()
        this.timer = setInterval(() => this.run(), BACKUP_INTERVAL_MS)
        this.timer.unref()
    }

    close(): void {
        clearInterval(this.timer)
        this.timer = undefined
    }

    run(): void {
        try {
            if (!this.config.autoBackupEnabled || !this.store.settings.get().autoBackupEnabled)
                return
            // total_changes sees this connection's writes; data_version sees other connections.
            const revision = JSON.stringify([
                this.database.sqlite.query('SELECT total_changes()').get(),
                this.database.sqlite.query('PRAGMA data_version').get(),
            ])
            if (revision === this.revision) return
            const snapshot = this.create('automatic')
            const destination = join(this.directory, snapshot.id)
            this.rotate(basename(destination))
            this.revision = revision
            this.logger.info(
                { event: 'backup.created', path: destination },
                'Automatic database backup created',
            )
        } catch (error) {
            this.logger.error(
                { err: error, event: 'backup.failed' },
                'Automatic database backup failed',
            )
        }
    }

    list(): BackupSnapshot[] {
        try {
            return readdirSync(this.directory)
                .flatMap((id): BackupSnapshot[] => {
                    const parsed = parseBackupName(id)
                    if (!parsed) return []
                    try {
                        return [{ id, ...parsed, size: statSync(join(this.directory, id)).size }]
                    } catch {
                        return []
                    }
                })
                .sort((left, right) => right.createdAt - left.createdAt)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
            throw error
        }
    }

    create(kind: 'automatic' | 'manual' | 'beforeRestore' = 'manual'): BackupSnapshot {
        mkdirSync(this.directory, { recursive: true, mode: 0o700 })
        const prefix =
            kind === 'automatic' ? 'auto' : kind === 'beforeRestore' ? 'before-restore' : 'manual'
        const createdAt = Date.now()
        const id = `${prefix}-${createdAt}-${crypto.randomUUID()}.sqlite`
        const destination = join(this.directory, id)
        const staging = `${destination}.tmp`
        let temporary: string | undefined
        try {
            mkdirSync(staging, { mode: 0o700 })
            temporary = join(staging, 'snapshot.sqlite')
            // VACUUM INTO includes committed WAL; the private staging dir protects secrets until chmod.
            this.database.sqlite.query('VACUUM INTO ?').run(temporary)
            chmodSync(temporary, 0o600)
            renameSync(temporary, destination)
            temporary = undefined
            rmdirSync(staging)
            return { id, createdAt, size: statSync(destination).size, kind }
        } catch (error) {
            if (temporary) safeUnlink(temporary)
            try {
                rmdirSync(staging)
            } catch {
                /* Keep the original error. */
            }
            throw error
        }
    }

    delete(id: string): boolean {
        const path = this.path(id)
        if (!path) return false
        unlinkSync(path)
        return true
    }

    file(id: string): string | null {
        return this.path(id)
    }

    restore(id: string): { restored: BackupSnapshot; safetySnapshot: BackupSnapshot } {
        const source = this.path(id)
        if (!source) throw new NotFoundError('Snapshot does not exist')
        if (this.store.generation.hasAnyRunning()) {
            throw new ConflictError('A response is being generated; wait for it to finish first')
        }
        validateSnapshot(source)
        const restored = this.list().find((snapshot) => snapshot.id === id)!
        const safetySnapshot = this.create('beforeRestore')
        this.close()
        try {
            this.database.replaceWith(source, join(this.directory, safetySnapshot.id))
            this.store.generation.recoverInterrupted()
            this.revision = ''
            this.afterRestore()
            if (this.config.autoBackupEnabled) this.start()
            this.logger.info(
                { event: 'backup.restored', snapshot: id, safetySnapshot: safetySnapshot.id },
                'Database snapshot restored',
            )
            return { restored, safetySnapshot }
        } catch (error) {
            if (this.config.autoBackupEnabled) this.start()
            throw error
        }
    }

    private path(id: string): string | null {
        if (!MANAGED_BACKUP_NAME.test(id)) return null
        const path = join(this.directory, id)
        try {
            return statSync(path).isFile() ? path : null
        } catch {
            return null
        }
    }

    private rotate(newest: string): void {
        const entries = [
            newest,
            ...readdirSync(this.directory)
                .filter((name) => name !== newest && AUTO_BACKUP_NAME.test(name))
                .sort()
                .reverse(),
        ]
        let bytes = 0
        for (const [index, name] of entries.entries()) {
            const path = join(this.directory, name)
            const size = statSync(path).size
            // Always retain the newest snapshot, even when it alone exceeds the cap.
            if (index === 0 || (index < BACKUP_MAX_COUNT && bytes + size <= BACKUP_MAX_BYTES)) {
                bytes += size
            } else {
                unlinkSync(path)
            }
        }
    }
}

function parseBackupName(id: string): Pick<BackupSnapshot, 'createdAt' | 'kind'> | null {
    const match = AUTO_BACKUP_NAME.exec(id)
    if (match) return { createdAt: Number(match[1]), kind: 'automatic' }
    const manual = MANUAL_BACKUP_NAME.exec(id)
    if (manual) return { createdAt: Number(manual[1]), kind: 'manual' }
    const safety = SAFETY_BACKUP_NAME.exec(id)
    if (safety) return { createdAt: Number(safety[1]), kind: 'beforeRestore' }
    return null
}

function validateSnapshot(path: string): void {
    const database = new Database(path, { readonly: true, strict: true })
    try {
        const integrity = database.query('PRAGMA integrity_check').get() as {
            integrity_check: string
        }
        if (integrity.integrity_check !== 'ok') throw new ValidationError('Snapshot is corrupted')
        const settings = database
            .query(
                "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'",
            )
            .get()
        if (!settings) throw new ValidationError('Snapshot is not a Malang database')
    } finally {
        database.close()
    }
}

function safeUnlink(path: string): void {
    try {
        unlinkSync(path)
    } catch {
        /* Best effort cleanup. */
    }
}

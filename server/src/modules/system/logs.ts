import { Database } from 'bun:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const MAX_LOGS = 5_000
const MAX_DETAILS = 10_000

export type SystemLogLevel = 'debug' | 'info' | 'warning' | 'error'

export interface SystemLogEntry {
    id: number
    timestamp: number
    level: SystemLogLevel
    message: string
    module: string | null
    event: string | null
    details: string | null
}

export class SystemLogService {
    private readonly database: Database
    private writesSinceRotation = 0

    constructor(dataDir: string) {
        mkdirSync(dataDir, { recursive: true, mode: 0o700 })
        const path = join(dataDir, 'system-logs.sqlite')
        this.database = new Database(path, { create: true, strict: true })
        chmodSync(path, 0o600)
        this.database.run('PRAGMA journal_mode = WAL;')
        this.database.run('PRAGMA busy_timeout = 5000;')
        this.database.run(`
            CREATE TABLE IF NOT EXISTS system_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                module TEXT,
                event TEXT,
                details TEXT
            )
        `)
        this.database.run(`
            CREATE TABLE IF NOT EXISTS system_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `)
    }

    capture(levelNumber: number, args: unknown[], bindings: Record<string, unknown> = {}): void {
        try {
            const level: SystemLogLevel =
                levelNumber >= 50
                    ? 'error'
                    : levelNumber >= 40
                      ? 'warning'
                      : levelNumber >= 30
                        ? 'info'
                        : 'debug'
            const first = isRecord(args[0]) ? args[0] : null
            const messageArg = first ? args[1] : args[0]
            const message = maskSensitive(
                formatValue(messageArg ?? first?.event ?? 'Log event'),
            ).slice(0, 1_000)
            const details = first ? stringifyDetails(first) : null
            this.database
                .query(
                    `INSERT INTO system_logs
                     (timestamp, level, message, module, event, details)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                )
                .run(
                    Date.now(),
                    level,
                    message,
                    text(first?.module ?? bindings.module, 100),
                    text(first?.event, 160),
                    details,
                )
            this.writesSinceRotation += 1
            if (this.writesSinceRotation >= 100) this.rotate()
        } catch {
            // Observability must never interrupt the application path it observes.
        }
    }

    list(limit = 500): SystemLogEntry[] {
        return this.database
            .query<SystemLogEntry, [number]>(
                `SELECT id, timestamp, level, message, module, event, details
                 FROM system_logs ORDER BY id DESC LIMIT ?`,
            )
            .all(Math.max(1, Math.min(limit, 1_000)))
    }

    clear(): number {
        const count = this.database
            .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM system_logs')
            .get()?.count
        this.database.run('DELETE FROM system_logs')
        return count ?? 0
    }

    requestLogCutoff(): number {
        const row = this.database
            .query<{ value: string }, [string]>('SELECT value FROM system_metadata WHERE key = ?')
            .get('request_log_rowid_cutoff')
        return Number(row?.value) || 0
    }

    clearRequestLogs(cutoff: number): number {
        this.database
            .query(
                `INSERT INTO system_metadata (key, value) VALUES ('request_log_rowid_cutoff', ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            )
            .run(String(cutoff))
        return cutoff
    }

    close(): void {
        this.database.close()
    }

    private rotate(): void {
        this.database
            .query(
                `DELETE FROM system_logs
                 WHERE id NOT IN (SELECT id FROM system_logs ORDER BY id DESC LIMIT ?)`,
            )
            .run(MAX_LOGS)
        this.writesSinceRotation = 0
    }
}

function stringifyDetails(value: Record<string, unknown>): string | null {
    const safe = sanitize(value, new WeakSet())
    const encoded = JSON.stringify(safe, null, 2)
    return encoded === '{}' ? null : maskSensitive(encoded).slice(0, MAX_DETAILS)
}

function sanitize(value: unknown, seen: WeakSet<object>, key = ''): unknown {
    if (isSensitiveKey(key)) return '[redacted]'
    if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack }
    }
    if (!value || typeof value !== 'object') return value
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, seen))
    return Object.fromEntries(
        Object.entries(value)
            .slice(0, 100)
            .map(([childKey, child]) => [childKey, sanitize(child, seen, childKey)]),
    )
}

function isSensitiveKey(key: string): boolean {
    return /^(?:password|passwd|authorization|cookie|set-cookie|api[-_]?key|private[-_]?key|secret|access[-_]?token|refresh[-_]?token|session[-_]?token|prompt|content|body)$/i.test(
        key,
    )
}

function maskSensitive(value: string): string {
    return value
        .replace(/Bearer\s+[A-Za-z0-9_.\-+/=]{10,}/gi, 'Bearer [redacted]')
        .replace(/sk-(?:ant-)?[A-Za-z0-9_-]{20,}/g, '[redacted-api-key]')
        .replace(/AIza[0-9A-Za-z_-]{35}/g, '[redacted-api-key]')
}

function text(value: unknown, max: number): string | null {
    return typeof value === 'string' ? value.slice(0, max) : null
}

function formatValue(value: unknown): string {
    if (typeof value === 'string') return value
    if (value instanceof Error) return value.message
    try {
        return JSON.stringify(value)
    } catch {
        return 'Log event'
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

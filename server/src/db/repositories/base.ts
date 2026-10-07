import { createHash } from 'node:crypto'

import type { LuaScript, LuaScriptInput } from '@malang/shared'

import { ConflictError } from '@/errors/app-error'

import type { DatabaseHandle } from '../db'

export abstract class RepositoryBase {
    constructor(protected readonly handle: DatabaseHandle) {}

    protected get sqlite() {
        return this.handle.sqlite
    }

    protected get db() {
        return this.handle.db
    }
}

export function iso(value: Date): string
export function iso(value: null): null
export function iso(value: Date | null): string | null
export function iso(value: Date | null): string | null {
    return value?.toISOString() ?? null
}

// Batch multi-row inserts under SQLite's portable bound-parameter limit (999).
const MAX_BOUND_PARAMETERS = 999

export function insertBatches<T extends object>(rows: T[]): T[][] {
    if (!rows.length) return []
    const size = Math.max(1, Math.floor(MAX_BOUND_PARAMETERS / Object.keys(rows[0]!).length))
    const batches: T[][] = []
    for (let index = 0; index < rows.length; index += size) {
        batches.push(rows.slice(index, index + size))
    }
    return batches
}

export function requireValue<T>(value: T | null | undefined, message: string): T {
    if (value === null || value === undefined) throw new Error(message)
    return value
}

export class LuaRevisionConflictError extends ConflictError {
    constructor(readonly actualRevision: number) {
        super(`Lua script revision conflict (current revision: ${actualRevision})`, {
            actualRevision,
        })
    }
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex')
}

export function newLuaColumns(input: LuaScriptInput | null | undefined) {
    if (!input) {
        return {
            luaCode: null,
            luaEnabled: false,
            luaLowLevelAccess: false,
            luaRevision: 0,
            luaCodeSha256: '',
        }
    }
    return {
        luaCode: input.code,
        luaEnabled: input.enabled,
        luaLowLevelAccess: input.lowLevelAccess,
        luaRevision: 1,
        luaCodeSha256: sha256(input.code),
    }
}

export function updateLuaColumns(
    current: LuaScript | null,
    input: LuaScriptInput | null,
): ReturnType<typeof newLuaColumns> {
    const actualRevision = current?.revision ?? 0
    if (input?.expectedRevision !== undefined && input.expectedRevision !== actualRevision) {
        throw new LuaRevisionConflictError(actualRevision)
    }
    if (!input) {
        return {
            luaCode: null,
            luaEnabled: false,
            luaLowLevelAccess: false,
            luaRevision: current ? actualRevision + 1 : 0,
            luaCodeSha256: '',
        }
    }
    const changed =
        !current ||
        current.code !== input.code ||
        current.enabled !== input.enabled ||
        current.lowLevelAccess !== input.lowLevelAccess
    return {
        luaCode: input.code,
        luaEnabled: input.enabled,
        luaLowLevelAccess: input.lowLevelAccess,
        luaRevision: changed ? actualRevision + 1 : actualRevision,
        luaCodeSha256: sha256(input.code),
    }
}

export function mapLuaScript(row: {
    luaCode: string | null
    luaEnabled: boolean
    luaLowLevelAccess: boolean
    luaRevision: number
    luaCodeSha256: string
}): LuaScript | null {
    if (row.luaCode === null) return null
    return {
        code: row.luaCode,
        enabled: row.luaEnabled,
        lowLevelAccess: row.luaLowLevelAccess,
        revision: row.luaRevision,
        codeSha256: row.luaCodeSha256 || sha256(row.luaCode),
    }
}

export function normalizeToggleValues(value: unknown): Record<string, string> {
    if (!isRecord(value)) return {}
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            typeof item === 'boolean'
                ? item
                    ? '1'
                    : '0'
                : typeof item === 'string'
                  ? item
                  : typeof item === 'number'
                    ? String(item)
                    : item === null || item === undefined
                      ? ''
                      : JSON.stringify(item),
        ]),
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

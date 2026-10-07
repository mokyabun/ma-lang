import { RepositoryBase } from './base'

export interface LuaDisplayBatchKey {
    conversationId: string
    displayEpoch: number
    scriptSetHash: string
}

export interface LuaDisplayBatchRow {
    status: string
    result_json: string | null
    error_json: string | null
}

/** Cache of rendered message display, valid for one display epoch and script set. */
export class LuaDisplayBatchRepository extends RepositoryBase {
    find(key: LuaDisplayBatchKey): LuaDisplayBatchRow | null {
        return this.sqlite
            .query<LuaDisplayBatchRow, [string, number, string]>(
                `SELECT status, result_json, error_json FROM lua_display_batches
                 WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
            )
            .get(key.conversationId, key.displayEpoch, key.scriptSetHash)
    }

    save(key: LuaDisplayBatchKey, result: unknown): void {
        const now = Date.now()
        this.sqlite
            .query(
                `INSERT INTO lua_display_batches
                 (conversation_id, display_epoch, script_set_hash, status, result_json, created_at, completed_at)
                 VALUES (?, ?, ?, 'complete', ?, ?, ?)
                 ON CONFLICT (conversation_id, display_epoch, script_set_hash)
                 DO UPDATE SET status = 'complete', result_json = excluded.result_json,
                               completed_at = excluded.completed_at`,
            )
            .run(
                key.conversationId,
                key.displayEpoch,
                key.scriptSetHash,
                JSON.stringify(result),
                now,
                now,
            )
    }

    fail(key: LuaDisplayBatchKey, error: unknown): void {
        const now = Date.now()
        this.sqlite
            .query(
                `INSERT INTO lua_display_batches
                 (conversation_id, display_epoch, script_set_hash, status, error_json, created_at, completed_at)
                 VALUES (?, ?, ?, 'failed', ?, ?, ?)
                 ON CONFLICT (conversation_id, display_epoch, script_set_hash)
                 DO UPDATE SET status = 'failed', error_json = excluded.error_json,
                               completed_at = excluded.completed_at`,
            )
            .run(
                key.conversationId,
                key.displayEpoch,
                key.scriptSetHash,
                JSON.stringify(error),
                now,
                now,
            )
    }
}

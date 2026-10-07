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

/** Cache of rendered chat display, valid for one display epoch and script set. */
export class LuaDisplayBatchRepository extends RepositoryBase {
    find(key: LuaDisplayBatchKey): LuaDisplayBatchRow | null {
        return this.sqlite
            .query<LuaDisplayBatchRow, [string, number, string]>(
                `SELECT status, result_json, error_json FROM lua_display_batches
                 WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
            )
            .get(key.conversationId, key.displayEpoch, key.scriptSetHash)
    }

    start(key: LuaDisplayBatchKey): void {
        this.sqlite
            .query(
                `INSERT INTO lua_display_batches
                 (conversation_id, display_epoch, script_set_hash, status, created_at)
                 VALUES (?, ?, ?, 'running', ?)`,
            )
            .run(key.conversationId, key.displayEpoch, key.scriptSetHash, Date.now())
    }

    complete(key: LuaDisplayBatchKey, result: unknown): void {
        this.sqlite
            .query(
                `UPDATE lua_display_batches SET status = 'complete', result_json = ?, completed_at = ?
                 WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
            )
            .run(
                JSON.stringify(result),
                Date.now(),
                key.conversationId,
                key.displayEpoch,
                key.scriptSetHash,
            )
    }

    fail(key: LuaDisplayBatchKey, error: unknown): void {
        this.sqlite
            .query(
                `UPDATE lua_display_batches SET status = 'failed', error_json = ?, completed_at = ?
                 WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
            )
            .run(
                JSON.stringify(error),
                Date.now(),
                key.conversationId,
                key.displayEpoch,
                key.scriptSetHash,
            )
    }
}

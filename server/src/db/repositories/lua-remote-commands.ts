import { RepositoryBase } from './base'

export interface LuaRemoteCommandRow {
    id: string
    kind: string
    payload_json: string
    blocking: number
    expires_at: number
}

/** Commands Lua sends to the initiating browser client, and the client's replies. */
export class LuaRemoteCommandRepository extends RepositoryBase {
    listPending(clientInstanceId: string): LuaRemoteCommandRow[] {
        return this.sqlite
            .query<LuaRemoteCommandRow, [string, number]>(
                `SELECT id, kind, payload_json, blocking, expires_at
                 FROM lua_remote_commands
                 WHERE client_instance_id = ? AND status = 'pending' AND expires_at > ?
                 ORDER BY created_at`,
            )
            .all(clientInstanceId, Date.now())
    }

    findByCall(invocationId: string, callIndex: number) {
        return this.sqlite
            .query<
                { id: string; status: string; result_json: string | null; expires_at: number },
                [string, number]
            >(
                'SELECT id, status, result_json, expires_at FROM lua_remote_commands WHERE invocation_id = ? AND call_index = ?',
            )
            .get(invocationId, callIndex)
    }

    get(id: string) {
        return this.sqlite
            .query<
                { client_instance_id: string; status: string; result_json: string | null },
                [string]
            >(
                'SELECT client_instance_id, status, result_json FROM lua_remote_commands WHERE id = ?',
            )
            .get(id)
    }

    create(input: {
        id: string
        invocationId: string
        callIndex: number
        clientInstanceId: string
        kind: string
        payload: unknown
        blocking: boolean
        expiresAt: number
    }): void {
        this.sqlite
            .query(
                `INSERT INTO lua_remote_commands
                 (id, invocation_id, call_index, client_instance_id, kind, payload_json,
                  status, blocking, expires_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
            )
            .run(
                input.id,
                input.invocationId,
                input.callIndex,
                input.clientInstanceId,
                input.kind,
                JSON.stringify(input.payload),
                input.blocking ? 1 : 0,
                input.expiresAt,
                Date.now(),
            )
    }

    /** No-op when the command already settled. */
    settle(id: string, status: 'complete' | 'failed', result: unknown): void {
        this.sqlite
            .query(
                `UPDATE lua_remote_commands
                 SET status = ?, result_json = ?, completed_at = ? WHERE id = ? AND status = 'pending'`,
            )
            .run(status, JSON.stringify(result), Date.now(), id)
    }
}

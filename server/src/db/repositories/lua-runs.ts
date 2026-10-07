import { RepositoryBase } from './base'

export interface LuaEventRunRow {
    id: string
    status: string
    result_json: string | null
    error_json: string | null
}

export interface LuaInvocationRow {
    id: string
    status: string
    result_json: string | null
    warnings_json: string
}

export interface LuaApiCallRow {
    status: string
    result_json: string | null
    error_json: string | null
}

/** Journal of Lua runs, script invocations and API calls; a retried event replays completed work. */
export class LuaRunRepository extends RepositoryBase {
    recoverInterrupted(): void {
        const now = Date.now()
        this.sqlite
            .query(
                `UPDATE lua_event_runs SET status = 'failed', error_json = ?, completed_at = ?
                 WHERE status = 'running'`,
            )
            .run(JSON.stringify({ message: 'Server stopped during Lua event' }), now)
        this.sqlite
            .query(
                `UPDATE lua_api_calls SET status = 'indeterminate', completed_at = ?
                 WHERE status = 'running'`,
            )
            .run(now)
    }

    findEvent(conversationId: string, eventKey: string, phase: string): LuaEventRunRow | null {
        return this.sqlite
            .query<LuaEventRunRow, [string, string, string]>(
                `SELECT id, status, result_json, error_json FROM lua_event_runs
                 WHERE conversation_id = ? AND event_key = ? AND phase = ?`,
            )
            .get(conversationId, eventKey, phase)
    }

    startEvent(input: {
        id: string
        conversationId: string
        eventKey: string
        phase: string
        clientInstanceId: string
        input: unknown
    }): void {
        this.sqlite
            .query(
                `INSERT INTO lua_event_runs
                 (id, conversation_id, event_key, phase, client_instance_id, status,
                  input_json, created_at)
                 VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`,
            )
            .run(
                input.id,
                input.conversationId,
                input.eventKey,
                input.phase,
                input.clientInstanceId,
                JSON.stringify(input.input),
                Date.now(),
            )
    }

    completeEvent(id: string, result: unknown): void {
        this.sqlite
            .query(
                `UPDATE lua_event_runs SET status = 'complete', result_json = ?, completed_at = ?
                 WHERE id = ?`,
            )
            .run(JSON.stringify(result), Date.now(), id)
    }

    failEvent(id: string, error: unknown): void {
        this.sqlite
            .query(
                `UPDATE lua_event_runs SET status = 'failed', error_json = ?, completed_at = ?
                 WHERE id = ?`,
            )
            .run(JSON.stringify(error), Date.now(), id)
    }

    findInvocation(
        eventRunId: string,
        ownerType: string,
        ownerId: string,
        scriptRevision: number,
    ): LuaInvocationRow | null {
        return this.sqlite
            .query<LuaInvocationRow, [string, string, string, number]>(
                `SELECT id, status, result_json, warnings_json FROM lua_invocations
                 WHERE event_run_id = ? AND owner_type = ? AND owner_id = ? AND script_revision = ?`,
            )
            .get(eventRunId, ownerType, ownerId, scriptRevision)
    }

    startInvocation(input: {
        id: string
        eventRunId: string
        ownerType: string
        ownerId: string
        scriptRevision: number
        sequence: number
    }): void {
        this.sqlite
            .query(
                `INSERT INTO lua_invocations
                 (id, event_run_id, owner_type, owner_id, script_revision, sequence, status,
                  created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
            )
            .run(
                input.id,
                input.eventRunId,
                input.ownerType,
                input.ownerId,
                input.scriptRevision,
                input.sequence,
                Date.now(),
            )
    }

    completeInvocation(id: string, result: unknown, warnings: string[]): void {
        this.sqlite
            .query(
                `UPDATE lua_invocations SET status = 'complete', result_json = ?, warnings_json = ?,
                 completed_at = ? WHERE id = ?`,
            )
            .run(JSON.stringify(result), JSON.stringify(warnings), Date.now(), id)
    }

    failInvocation(id: string, error: unknown, warnings: string[]): void {
        this.sqlite
            .query(
                `UPDATE lua_invocations SET status = 'failed', error_json = ?, warnings_json = ?,
                 completed_at = ? WHERE id = ?`,
            )
            .run(JSON.stringify(error), JSON.stringify(warnings), Date.now(), id)
    }

    findApiCall(invocationId: string, callIndex: number): LuaApiCallRow | null {
        return this.sqlite
            .query<LuaApiCallRow, [string, number]>(
                'SELECT status, result_json, error_json FROM lua_api_calls WHERE invocation_id = ? AND call_index = ?',
            )
            .get(invocationId, callIndex)
    }

    startApiCall(input: {
        invocationId: string
        callIndex: number
        operation: string
        request: unknown
    }): void {
        this.sqlite
            .query(
                `INSERT INTO lua_api_calls
                 (id, invocation_id, call_index, operation, status, request_json, created_at)
                 VALUES (?, ?, ?, ?, 'running', ?, ?)`,
            )
            .run(
                crypto.randomUUID(),
                input.invocationId,
                input.callIndex,
                input.operation,
                JSON.stringify(input.request),
                Date.now(),
            )
    }

    completeApiCall(invocationId: string, callIndex: number, result: unknown): void {
        this.sqlite
            .query(
                `UPDATE lua_api_calls SET status = 'complete', result_json = ?, completed_at = ?
                 WHERE invocation_id = ? AND call_index = ?`,
            )
            .run(JSON.stringify(result), Date.now(), invocationId, callIndex)
    }

    failApiCall(invocationId: string, callIndex: number, error: unknown): void {
        this.sqlite
            .query(
                `UPDATE lua_api_calls SET status = 'failed', error_json = ?, completed_at = ?
                 WHERE invocation_id = ? AND call_index = ?`,
            )
            .run(JSON.stringify(error), Date.now(), invocationId, callIndex)
    }
}

import type { LuaRemoteCommandResult } from '@malang/shared'

import type { LuaRemoteCommandRow, Store } from '@/db'
import type { RuntimeEventHub } from '@/services/app/runtime-events'

export interface RuntimeCommand {
    type: 'runtime.command'
    commandId: string
    kind: string
    payload: unknown
    blocking: boolean
    expiresAt: string
}

interface PendingCommand {
    clientInstanceId: string
    resolve(value: unknown): void
    reject(error: Error): void
    timer: ReturnType<typeof setTimeout>
}

export class LuaRemoteCommandError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'LuaRemoteCommandError'
    }
}

export class RemoteRuntime {
    private readonly pending = new Map<string, PendingCommand>()

    constructor(
        private readonly store: Store,
        private readonly hub: RuntimeEventHub,
    ) {
        hub.register({
            connected: (clientInstanceId, send) => {
                for (const row of this.store.luaRemoteCommand.listPending(clientInstanceId)) {
                    send(commandMessage(this.rowCommand(row)))
                }
            },
            disconnected: (clientInstanceId) => this.abandon(clientInstanceId),
        })
    }

    issue(input: {
        invocationId: string
        callIndex: number
        clientInstanceId: string
        kind: string
        payload: unknown
        blocking: boolean
        timeoutMs?: number
    }): Promise<unknown> {
        const existing = this.store.luaRemoteCommand.findByCall(input.invocationId, input.callIndex)
        if (existing?.status === 'complete') {
            return Promise.resolve(parseJson(existing.result_json, null))
        }
        const id = existing?.id ?? crypto.randomUUID()
        const expiresAt = existing?.expires_at ?? Date.now() + (input.timeoutMs ?? 300_000)
        if (!existing) {
            this.store.luaRemoteCommand.create({
                id,
                invocationId: input.invocationId,
                callIndex: input.callIndex,
                clientInstanceId: input.clientInstanceId,
                kind: input.kind,
                payload: input.payload,
                blocking: input.blocking,
                expiresAt,
            })
        }
        const command: RuntimeCommand = {
            type: 'runtime.command',
            commandId: id,
            kind: input.kind,
            payload: input.payload,
            blocking: input.blocking,
            expiresAt: new Date(expiresAt).toISOString(),
        }
        this.hub.sendTo(input.clientInstanceId, commandMessage(command))
        if (!input.blocking) return Promise.resolve(null)
        if (!this.hub.isConnected(input.clientInstanceId)) {
            this.failCommand(id, 'The initiating client is not connected')
            return Promise.reject(
                new LuaRemoteCommandError('The initiating client is not connected'),
            )
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => {
                    this.pending.delete(id)
                    this.failCommand(id, 'Remote command expired')
                    reject(new LuaRemoteCommandError('Remote command expired'))
                },
                Math.max(1, expiresAt - Date.now()),
            )
            this.pending.set(id, {
                clientInstanceId: input.clientInstanceId,
                resolve,
                reject,
                timer,
            })
        })
    }

    resolve(commandId: string, input: LuaRemoteCommandResult): 'ok' | 'not_found' | 'forbidden' {
        const row = this.store.luaRemoteCommand.get(commandId)
        if (!row) return 'not_found'
        if (row.client_instance_id !== input.clientInstanceId) return 'forbidden'
        if (row.status === 'complete') return 'ok'
        if (row.status !== 'pending') return 'not_found'
        this.store.luaRemoteCommand.settle(
            commandId,
            input.error ? 'failed' : 'complete',
            input.result,
        )
        const pending = this.pending.get(commandId)
        if (pending) {
            clearTimeout(pending.timer)
            this.pending.delete(commandId)
            if (input.error) pending.reject(new LuaRemoteCommandError(input.error))
            else pending.resolve(input.result)
        }
        return 'ok'
    }

    private abandon(clientInstanceId: string) {
        for (const [id, pending] of this.pending) {
            if (pending.clientInstanceId !== clientInstanceId) continue
            clearTimeout(pending.timer)
            pending.reject(new LuaRemoteCommandError('The initiating client disconnected'))
            this.pending.delete(id)
            this.failCommand(id, 'The initiating client disconnected')
        }
    }

    private failCommand(id: string, error: string) {
        this.store.luaRemoteCommand.settle(id, 'failed', { error })
    }

    private rowCommand(row: LuaRemoteCommandRow): RuntimeCommand {
        return {
            type: 'runtime.command',
            commandId: row.id,
            kind: row.kind,
            payload: parseJson(row.payload_json, null),
            blocking: row.blocking === 1,
            expiresAt: new Date(row.expires_at).toISOString(),
        }
    }
}

function commandMessage(command: RuntimeCommand) {
    return { id: command.commandId, data: command }
}

function parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback
    try {
        return JSON.parse(value) as T
    } catch {
        return fallback
    }
}

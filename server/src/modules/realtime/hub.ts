import type { RuntimeEvent } from '@malang/shared'

type Controller = ReadableStreamDefaultController<Uint8Array>

interface ClientHooks {
    /** Runs for every new connection, including a second tab of the same client. */
    connected?(clientInstanceId: string, send: (message: RuntimeMessage) => void): void
    /** Runs once the client's last connection closes. */
    disconnected?(clientInstanceId: string): void
}

export interface RuntimeMessage {
    /** SSE event id; only commands carry one. */
    id?: string
    data: unknown
}

/** Owns the `/runtime/events` SSE connections shared by runtime commands and general events. */
export class RuntimeEventHub {
    private readonly clients = new Map<string, Set<Controller>>()
    private readonly hooks: ClientHooks[] = []
    private readonly encoder = new TextEncoder()

    register(hooks: ClientHooks): void {
        this.hooks.push(hooks)
    }

    subscribe(clientInstanceId: string): ReadableStream<Uint8Array> {
        let controllerRef: Controller | undefined
        return new ReadableStream({
            start: (controller) => {
                controllerRef = controller
                const clients = this.clients.get(clientInstanceId) ?? new Set()
                clients.add(controller)
                this.clients.set(clientInstanceId, clients)
                controller.enqueue(this.encoder.encode(': connected\n\n'))
                for (const hooks of this.hooks) {
                    hooks.connected?.(clientInstanceId, (message) =>
                        this.write(controller, message),
                    )
                }
            },
            cancel: () => {
                if (!controllerRef) return
                const clients = this.clients.get(clientInstanceId)
                clients?.delete(controllerRef)
                if (clients?.size) return
                this.clients.delete(clientInstanceId)
                for (const hooks of this.hooks) hooks.disconnected?.(clientInstanceId)
            },
        })
    }

    isConnected(clientInstanceId: string): boolean {
        return !!this.clients.get(clientInstanceId)?.size
    }

    sendTo(clientInstanceId: string, message: RuntimeMessage): void {
        for (const controller of this.clients.get(clientInstanceId) ?? []) {
            this.write(controller, message)
        }
    }

    publish(event: RuntimeEvent): void {
        const message = { data: event }
        for (const clients of this.clients.values()) {
            for (const controller of clients) this.write(controller, message)
        }
    }

    private write(controller: Controller, message: RuntimeMessage): void {
        const id = message.id ? `id: ${message.id}\n` : ''
        try {
            controller.enqueue(
                this.encoder.encode(`${id}data: ${JSON.stringify(message.data)}\n\n`),
            )
        } catch {
            // Stream cancellation performs connection cleanup.
        }
    }
}

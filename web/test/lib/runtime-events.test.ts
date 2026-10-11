import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

import type { RuntimeEvent } from '@malang/shared'
import { installDom } from '@test/helpers/dom'
import { testId } from '@test/helpers/fixtures'

import { api } from '@/lib/api'
import {
    connectRuntimeEvents,
    subscribeRuntimeConnection,
    subscribeRuntimeEvents,
} from '@/lib/runtime-events'

installDom()

class FakeEventSource {
    static latest: FakeEventSource | undefined
    onopen: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    closed = false

    constructor(
        readonly url: string,
        readonly init: EventSourceInit,
    ) {
        FakeEventSource.latest = this
    }

    send(message: unknown) {
        this.onmessage?.({ data: JSON.stringify(message) })
    }

    close() {
        this.closed = true
    }
}

// happy-dom has no native dialogs; each test decides what the user answers.
const dialogs = {
    alert: mock((_message?: string) => {}),
    confirm: mock((_message?: string) => false),
    prompt: mock((_message?: string): string | null => null),
}

const originalEventSource = globalThis.EventSource
beforeEach(() => {
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
    for (const dialog of Object.values(dialogs)) dialog.mockClear()
    Object.assign(window, dialogs)
})
afterEach(() => {
    globalThis.EventSource = originalEventSource
})

let nextCommand = 0
function command(kind: string, payload: Record<string, unknown> = {}) {
    nextCommand += 1
    return {
        type: 'runtime.command',
        commandId: testId(10_000 + nextCommand),
        kind,
        payload,
        blocking: true,
    }
}

function connect(onReload: () => void | Promise<void> = () => {}) {
    const disconnect = connectRuntimeEvents(onReload)
    return { source: FakeEventSource.latest!, disconnect }
}

function settle() {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

const continuityEvent: RuntimeEvent = {
    type: 'runtime.event',
    name: 'continuity.updated',
    data: { conversationId: testId(100) },
}

describe('runtime events', () => {
    test('opens one credentialed stream per client and closes it on disconnect', () => {
        const { source, disconnect } = connect()
        expect(source.url).toStartWith('/api/v1/runtime/events?clientInstanceId=')
        expect(source.init).toEqual({ withCredentials: true })
        disconnect()
        expect(source.closed).toBe(true)
    })

    test('delivers valid events to subscribers until they unsubscribe', () => {
        const received: RuntimeEvent[] = []
        const unsubscribe = subscribeRuntimeEvents((event) => received.push(event))
        const { source } = connect()

        source.send(continuityEvent)
        source.send({ type: 'runtime.event', name: 'continuity.updated', data: {} })
        unsubscribe()
        source.send(continuityEvent)

        expect(received).toEqual([continuityEvent])
    })

    test('notifies connection listeners on every (re)connection', () => {
        let connections = 0
        const unsubscribe = subscribeRuntimeConnection(() => (connections += 1))
        const { source } = connect()
        source.onopen?.()
        source.onopen?.()
        unsubscribe()
        source.onopen?.()
        expect(connections).toBe(2)
    })

    test('answers dialog commands with what the user chose', async () => {
        const resolve = spyOn(api, 'resolveRuntimeCommand').mockResolvedValue({ ok: true })
        dialogs.confirm.mockReturnValueOnce(true)
        const { alert, prompt } = dialogs
        const { source } = connect()

        const notice = command('alertNormal', { message: { text: 'hi' } })
        source.send(notice)
        expect(alert).toHaveBeenCalledWith('{"text":"hi"}')

        const confirm = command('alertConfirm', { message: 'Continue?' })
        source.send(confirm)

        prompt.mockReturnValueOnce('Mina')
        const input = command('alertInput', { message: 'Name?' })
        source.send(input)

        prompt.mockReturnValueOnce('2')
        const select = command('alertSelect', { options: ['left', 'right'] })
        source.send(select)
        expect(prompt).toHaveBeenLastCalledWith('1. left\n2. right')

        prompt.mockReturnValueOnce('7')
        const outOfRange = command('alertSelect', { options: ['left'] })
        source.send(outOfRange)

        await settle()
        const results = new Map(resolve.mock.calls.map(([id, body]) => [id, body.result]))
        expect(results.get(notice.commandId)).toBeNull()
        expect(results.get(confirm.commandId)).toBe(true)
        expect(results.get(input.commandId)).toBe('Mina')
        expect(results.get(select.commandId)).toBe('right')
        expect(results.get(outOfRange.commandId)).toBe('')
    })

    test('runs a command once and resends its saved result when it is delivered again', async () => {
        const resolve = spyOn(api, 'resolveRuntimeCommand').mockResolvedValue({ ok: true })
        const { confirm } = dialogs
        const { source } = connect()
        const repeated = command('alertConfirm', { message: 'Sure?' })

        source.send(repeated)
        await settle()
        source.send(repeated)
        await settle()

        expect(confirm).toHaveBeenCalledTimes(1)
        expect(resolve).toHaveBeenCalledTimes(2)
        expect(resolve.mock.calls[1]![1]).toMatchObject({ result: false })
        expect(resolve.mock.calls[1]![1]).toEqual(resolve.mock.calls[0]![1])
    })

    test('reloads the chat on request and reports a failing handler', async () => {
        const resolve = spyOn(api, 'resolveRuntimeCommand').mockResolvedValue({ ok: true })
        let reloads = 0
        const { source } = connect(async () => {
            reloads += 1
            if (reloads === 2) throw new Error('reload failed')
        })

        const first = command('reloadChat')
        source.send(first)
        await settle()
        const second = command('reloadChat')
        source.send(second)
        await settle()

        expect(reloads).toBe(2)
        expect(resolve).toHaveBeenCalledWith(
            first.commandId,
            expect.objectContaining({ result: null }),
        )
        expect(resolve).toHaveBeenCalledWith(
            second.commandId,
            expect.objectContaining({ result: null, error: 'reload failed' }),
        )
    })
})

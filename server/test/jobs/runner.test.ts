import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { RuntimeEvent } from '@malang/shared'
import pino from 'pino'
import { z } from 'zod'

import { type DatabaseHandle, openDatabase, Store } from '@/db'
import { JobRunner, RetryableJobError } from '@/modules/jobs/runner'
import { RuntimeEventHub } from '@/modules/realtime/hub'

const silent = pino({ level: 'silent' })
const Payload = z.object({ value: z.string() })

async function until(check: () => boolean, timeoutMs = 2_000) {
    const deadline = Date.now() + timeoutMs
    while (!check()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for condition')
        await Bun.sleep(5)
    }
}

function deferred<T = void>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => (resolve = done))
    return { promise, resolve }
}

describe('background job runner', () => {
    let handle: DatabaseHandle
    let store: Store
    let events: RuntimeEventHub
    let runner: JobRunner

    function createRunner(lanes: Record<string, number> = {}) {
        return new JobRunner(store, events, silent, {
            lanes,
            backoff: { baseMs: 10, maxMs: 40 },
        })
    }

    const status = (id: string) => store.backgroundJob.get(id)?.status

    beforeEach(() => {
        handle = openDatabase(':memory:')
        store = new Store(handle)
        events = new RuntimeEventHub()
        runner = createRunner()
    })

    afterEach(() => {
        runner.close()
        handle.close()
    })

    test('runs a queued job, stores its result, and publishes each transition', async () => {
        const published: RuntimeEvent[] = []
        events.publish = (event) => void published.push(event)
        runner.define({
            kind: 'echo',
            payload: Payload,
            run: async ({ payload }) => ({ echoed: payload.value }),
        })
        runner.start()

        const job = runner.enqueue('echo', { value: 'hi' })
        await until(() => status(job.id) === 'complete')

        expect(store.backgroundJob.get(job.id)?.result).toEqual({ echoed: 'hi' })
        const jobEvents = published.flatMap((event) =>
            event.name === 'job.updated' ? [event] : [],
        )
        expect(jobEvents.map((event) => event.data.status)).toEqual([
            'queued',
            'running',
            'complete',
        ])
    })

    test('rejects a payload that does not match the job schema', () => {
        runner.define({ kind: 'echo', payload: Payload, run: async () => null })
        expect(() => runner.enqueue('echo', { value: 1 })).toThrow()
    })

    test('limits concurrency per lane', async () => {
        runner.close()
        runner = createRunner({ shared: 1, wide: 2 })
        let active = 0
        let peak = 0
        const run = async () => {
            active++
            peak = Math.max(peak, active)
            await Bun.sleep(15)
            active--
            return null
        }
        runner.define({ kind: 'a', lane: 'shared', payload: Payload, run })
        runner.define({ kind: 'b', lane: 'shared', payload: Payload, run })
        runner.start()

        const jobs = [
            runner.enqueue('a', { value: '1' }),
            runner.enqueue('b', { value: '2' }),
            runner.enqueue('a', { value: '3' }),
        ]
        await until(() => jobs.every((job) => status(job.id) === 'complete'))
        expect(peak).toBe(1)
    })

    test('lets direct lane work go ahead of queued jobs without exceeding the limit', async () => {
        runner.close()
        runner = createRunner({ novelai: 1 })
        const order: string[] = []
        const gate = deferred()
        runner.define({
            kind: 'render',
            lane: 'novelai',
            payload: Payload,
            run: async ({ payload }) => {
                order.push(`job:${payload.value}`)
                if (payload.value === 'first') await gate.promise
                return null
            },
        })
        runner.start()

        const first = runner.enqueue('render', { value: 'first' })
        await until(() => status(first.id) === 'running')
        const second = runner.enqueue('render', { value: 'second' })
        const direct = runner.runInLane('novelai', async () => order.push('direct'))
        gate.resolve()
        await direct
        await until(() => status(second.id) === 'complete')

        expect(order).toEqual(['job:first', 'direct', 'job:second'])
    })

    test('retries a retryable failure with backoff, then succeeds', async () => {
        let calls = 0
        runner.define({
            kind: 'flaky',
            payload: Payload,
            run: async () => {
                calls++
                if (calls === 1) throw new RetryableJobError('busy', { code: 'rate_limited' })
                return 'ok'
            },
        })
        runner.start()

        const job = runner.enqueue('flaky', { value: 'x' })
        await until(() => status(job.id) === 'complete')

        const stored = store.backgroundJob.get(job.id)!
        expect(stored.attempts).toBe(2)
        expect(stored.error).toBeNull()
    })

    test('fails after the last attempt and on non-retryable errors', async () => {
        runner.define({
            kind: 'busy',
            payload: Payload,
            maxAttempts: 2,
            run: async () => {
                throw new RetryableJobError('still busy', { code: 'rate_limited' })
            },
        })
        runner.define({
            kind: 'broken',
            payload: Payload,
            run: async () => {
                throw new Error('bad input')
            },
        })
        runner.start()

        const busy = runner.enqueue('busy', { value: 'x' })
        const broken = runner.enqueue('broken', { value: 'x' })
        await until(() => status(busy.id) === 'failed' && status(broken.id) === 'failed')

        expect(store.backgroundJob.get(busy.id)).toMatchObject({
            attempts: 2,
            error: { message: 'still busy', code: 'rate_limited' },
        })
        expect(store.backgroundJob.get(broken.id)).toMatchObject({
            attempts: 1,
            error: { message: 'bad input' },
        })

        expect(runner.retry(broken.id)?.status).toBe('queued')
        await until(() => status(broken.id) === 'failed')
        expect(store.backgroundJob.get(broken.id)?.attempts).toBe(1)
    })

    test('cancels a running job, aborts its signal, and ignores its result', async () => {
        const started = deferred()
        let aborted = false
        runner.define({
            kind: 'slow',
            payload: Payload,
            run: async ({ signal }) => {
                started.resolve()
                await new Promise((resolve) => signal.addEventListener('abort', resolve))
                aborted = signal.aborted
                return 'late'
            },
        })
        runner.start()

        const job = runner.enqueue('slow', { value: 'x' }, { messageId: crypto.randomUUID() })
        await started.promise
        const cancelled = runner.cancel({ messageId: job.messageId! })

        expect(cancelled.map((item) => item.id)).toEqual([job.id])
        await until(() => aborted)
        await Bun.sleep(10)
        expect(store.backgroundJob.get(job.id)).toMatchObject({ status: 'cancelled', result: null })
    })

    test('requeues jobs interrupted by a restart and fails ones out of attempts', async () => {
        const resumable = store.backgroundJob.enqueue({
            kind: 'resume',
            payload: { value: 'x' },
            maxAttempts: 3,
        })
        const exhausted = store.backgroundJob.enqueue({
            kind: 'resume',
            payload: { value: 'y' },
            maxAttempts: 1,
        })
        // Both were claimed by a previous server process that stopped mid-run.
        store.backgroundJob.claimDue(['resume'], 2)

        const seen: string[] = []
        runner.define({
            kind: 'resume',
            payload: Payload,
            run: async ({ payload }) => void seen.push(payload.value),
        })
        runner.start()

        await until(() => status(resumable.id) === 'complete')
        expect(seen).toEqual(['x'])
        expect(store.backgroundJob.get(resumable.id)?.attempts).toBe(2)
        expect(store.backgroundJob.get(exhausted.id)).toMatchObject({
            status: 'failed',
            error: { message: 'Server stopped during the last attempt' },
        })
    })

    test('waits for run_after before claiming a job', async () => {
        runner.define({ kind: 'later', payload: Payload, run: async () => null })
        runner.start()

        const job = runner.enqueue('later', { value: 'x' }, { runAfter: new Date(Date.now() + 60) })
        await Bun.sleep(20)
        expect(status(job.id)).toBe('queued')
        await until(() => status(job.id) === 'complete')
    })
})

import type { BackgroundJob, BackgroundJobError } from '@malang/shared'
import type { Logger } from 'pino'
import type { z } from 'zod'

import type { Store } from '@/db'
import type { BackgroundJobRecord } from '@/modules/jobs/repo'
import type { RuntimeEventHub } from '@/modules/realtime/hub'

export interface JobContext<P> {
    job: BackgroundJob
    payload: P
    /** Aborts when the job is cancelled or the server shuts down. */
    signal: AbortSignal
}

export interface JobDefinition<P = unknown> {
    kind: string
    /** Jobs sharing a lane share its concurrency limit; defaults to the kind. */
    lane?: string
    payload: z.ZodType<P>
    maxAttempts?: number
    run(context: JobContext<P>): Promise<unknown>
}

export interface EnqueueOptions {
    conversationId?: string | null
    messageId?: string | null
    runAfter?: Date
    maxAttempts?: number
}

export interface JobRunnerOptions {
    lanes?: Record<string, number>
    backoff?: { baseMs: number; maxMs: number }
    /** Upper bound on how long the runner sleeps between due-job checks. */
    idleCheckMs?: number
}

/** Throw from a job to retry it later instead of failing it outright. */
export class RetryableJobError extends Error {
    readonly retryAfterMs?: number
    readonly code?: string

    constructor(
        message: string,
        options: { retryAfterMs?: number; code?: string; cause?: unknown } = {},
    ) {
        super(message, { cause: options.cause })
        this.name = 'RetryableJobError'
        this.retryAfterMs = options.retryAfterMs
        this.code = options.code
    }
}

const DEFAULT_MAX_ATTEMPTS = 3
const FINISHED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

class Lane {
    active = 0
    private readonly waiters: Array<() => void> = []

    constructor(readonly limit: number) {}

    /** Capacity left for queued jobs; direct callers waiting for a slot go first. */
    get free(): number {
        return Math.max(0, this.limit - this.active - this.waiters.length)
    }

    acquire(): Promise<void> {
        if (this.active < this.limit && !this.waiters.length) {
            this.active++
            return Promise.resolve()
        }
        return new Promise((resolve) => this.waiters.push(resolve))
    }

    release(): void {
        const next = this.waiters.shift()
        if (next) next()
        else this.active--
    }
}

export class JobRunner {
    private readonly definitions = new Map<string, JobDefinition<unknown>>()
    private readonly lanes = new Map<string, Lane>()
    private readonly running = new Map<string, AbortController>()
    private readonly backoff: { baseMs: number; maxMs: number }
    private readonly idleCheckMs: number
    private timer: ReturnType<typeof setTimeout> | null = null
    private started = false
    private closed = false

    constructor(
        private readonly store: Store,
        private readonly events: RuntimeEventHub,
        private readonly log: Logger,
        private readonly options: JobRunnerOptions = {},
    ) {
        this.backoff = options.backoff ?? { baseMs: 5_000, maxMs: 5 * 60_000 }
        this.idleCheckMs = options.idleCheckMs ?? 60_000
    }

    define<P>(definition: JobDefinition<P>): void {
        if (this.definitions.has(definition.kind)) {
            throw new Error(`Job kind ${definition.kind} is already defined`)
        }
        this.definitions.set(definition.kind, definition)
        this.lane(definition.lane ?? definition.kind)
    }

    start(): void {
        if (this.started) return
        this.started = true
        this.store.backgroundJob.recoverInterrupted()
        this.store.backgroundJob.pruneFinished(new Date(Date.now() - FINISHED_RETENTION_MS))
        this.pump()
    }

    close(): void {
        this.closed = true
        if (this.timer) clearTimeout(this.timer)
        // Interrupted jobs stay `running` in the database and are requeued on the next start.
        for (const controller of this.running.values()) controller.abort()
    }

    enqueue(kind: string, payload: unknown, options: EnqueueOptions = {}): BackgroundJob {
        const definition = this.definitions.get(kind)
        if (!definition) throw new Error(`Job kind ${kind} is not defined`)
        const record = this.store.backgroundJob.enqueue({
            kind,
            payload: definition.payload.parse(payload),
            maxAttempts: options.maxAttempts ?? definition.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
            runAfter: options.runAfter,
            conversationId: options.conversationId,
            messageId: options.messageId,
        })
        this.publish(record)
        this.pump()
        return toBackgroundJob(record)
    }

    cancel(filter: {
        id?: string
        messageId?: string
        conversationId?: string
        kind?: string
    }): BackgroundJob[] {
        const cancelled = this.store.backgroundJob.cancel(filter)
        for (const record of cancelled) {
            this.running.get(record.id)?.abort()
            this.publish(record)
        }
        return cancelled.map(toBackgroundJob)
    }

    retry(id: string): BackgroundJob | null {
        const record = this.store.backgroundJob.retry(id)
        if (!record) return null
        this.publish(record)
        this.pump()
        return toBackgroundJob(record)
    }

    get(id: string): BackgroundJob | null {
        const record = this.store.backgroundJob.get(id)
        return record ? toBackgroundJob(record) : null
    }

    listActive(filter: { conversationId?: string; messageId?: string }): BackgroundJob[] {
        return this.store.backgroundJob.listActive(filter).map(toBackgroundJob)
    }

    /** Runs work outside the queue under a lane's limit, ahead of queued jobs. */
    async runInLane<T>(laneName: string, work: () => Promise<T>): Promise<T> {
        const lane = this.lane(laneName)
        await lane.acquire()
        try {
            return await work()
        } finally {
            lane.release()
            this.pump()
        }
    }

    private lane(name: string): Lane {
        let lane = this.lanes.get(name)
        if (!lane) {
            lane = new Lane(this.options.lanes?.[name] ?? 1)
            this.lanes.set(name, lane)
        }
        return lane
    }

    private kindsIn(laneName: string): string[] {
        return [...this.definitions.values()]
            .filter((definition) => (definition.lane ?? definition.kind) === laneName)
            .map((definition) => definition.kind)
    }

    private pump(): void {
        if (!this.started || this.closed) return
        if (this.timer) clearTimeout(this.timer)
        this.timer = null

        const idleKinds: string[] = []
        for (const [name, lane] of this.lanes) {
            const kinds = this.kindsIn(name)
            if (!kinds.length) continue
            const claimed = this.store.backgroundJob.claimDue(kinds, lane.free)
            lane.active += claimed.length
            for (const record of claimed) void this.execute(record, lane)
            if (lane.free > 0) idleKinds.push(...kinds)
        }
        this.scheduleNext(idleKinds)
    }

    // Busy lanes are not polled; finishing a job pumps again.
    private scheduleNext(idleKinds: string[]): void {
        const next = this.store.backgroundJob.nextRunAfter(idleKinds)
        const delay = next ? Math.max(0, next.getTime() - Date.now()) : this.idleCheckMs
        this.timer = setTimeout(() => this.pump(), Math.min(delay, this.idleCheckMs))
        this.timer.unref?.()
    }

    private async execute(record: BackgroundJobRecord, lane: Lane): Promise<void> {
        const definition = this.definitions.get(record.kind)!
        const controller = new AbortController()
        this.running.set(record.id, controller)
        this.publish(record)
        try {
            const result = await definition.run({
                job: toBackgroundJob(record),
                payload: definition.payload.parse(record.payload),
                signal: controller.signal,
            })
            if (controller.signal.aborted) return
            this.publishIfSettled(this.store.backgroundJob.complete(record.id, result))
        } catch (error) {
            if (controller.signal.aborted) return
            this.settleFailure(record, error)
        } finally {
            this.running.delete(record.id)
            lane.release()
            this.pump()
        }
    }

    private settleFailure(record: BackgroundJobRecord, error: unknown): void {
        const failure = jobError(error)
        const retryable = error instanceof RetryableJobError
        if (retryable && record.attempts < record.maxAttempts) {
            const delay = Math.max(
                error.retryAfterMs ?? 0,
                Math.min(this.backoff.maxMs, this.backoff.baseMs * 2 ** (record.attempts - 1)),
            )
            this.log.warn(
                {
                    event: 'job.retry_scheduled',
                    jobId: record.id,
                    kind: record.kind,
                    delay,
                    err: error,
                },
                'Background job will retry',
            )
            this.publishIfSettled(
                this.store.backgroundJob.retryLater(
                    record.id,
                    failure,
                    new Date(Date.now() + delay),
                ),
            )
            return
        }
        this.log.error(
            { event: 'job.failed', jobId: record.id, kind: record.kind, err: error },
            'Background job failed',
        )
        this.publishIfSettled(this.store.backgroundJob.fail(record.id, failure))
    }

    private publishIfSettled(record: BackgroundJobRecord | null): void {
        if (record) this.publish(record)
    }

    private publish(record: BackgroundJobRecord): void {
        this.events.publish({
            type: 'runtime.event',
            name: 'job.updated',
            data: toBackgroundJob(record),
        })
    }
}

function toBackgroundJob(record: BackgroundJobRecord): BackgroundJob {
    const { payload: _payload, result: _result, ...job } = record
    return job
}

function jobError(error: unknown): BackgroundJobError {
    const message = error instanceof Error ? error.message : String(error)
    const code =
        error instanceof RetryableJobError
            ? error.code
            : error &&
                typeof error === 'object' &&
                'code' in error &&
                typeof error.code === 'string'
              ? error.code
              : undefined
    return code ? { message, code } : { message }
}

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SystemLogService } from '@/services/app/system-logs'

describe('persistent system logs', () => {
    let directory: string
    let logs: SystemLogService

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'malang-system-logs-'))
        logs = new SystemLogService(directory)
    })

    afterEach(() => {
        logs.close()
        rmSync(directory, { recursive: true, force: true })
    })

    test('captures structured events and masks sensitive fields', () => {
        logs.capture(
            50,
            [
                {
                    event: 'provider.failed',
                    apiKey: 'sk-secret-that-must-never-be-visible',
                    error: new Error('provider unavailable'),
                },
                'Provider request failed',
            ],
            { module: 'generation-service' },
        )

        expect(logs.list()).toEqual([
            expect.objectContaining({
                level: 'error',
                message: 'Provider request failed',
                module: 'generation-service',
                event: 'provider.failed',
            }),
        ])
        expect(logs.list()[0]?.details).toContain('[redacted]')
        expect(logs.list()[0]?.details).not.toContain('sk-secret')
    })

    test('clears logs and independently advances the request-log cutoff', () => {
        logs.capture(20, [{ event: 'request.completed' }, 'Request completed'])
        logs.capture(30, ['Ready'])
        expect(logs.list()).toEqual([
            expect.objectContaining({ level: 'info', message: 'Ready' }),
            expect.objectContaining({ level: 'debug', event: 'request.completed' }),
        ])
        expect(logs.clear()).toBe(2)
        expect(logs.list()).toHaveLength(0)
        expect(logs.requestLogCutoff()).toBe(0)
        expect(logs.clearRequestLogs(42)).toBe(42)
        expect(logs.requestLogCutoff()).toBe(42)
    })
})

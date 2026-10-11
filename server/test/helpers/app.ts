import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from '@/app'
import { createContext } from '@/bootstrap'
import type { AppConfig } from '@/config'
import type { AppContext } from '@/context'

const TEST_ADMIN_PASSWORD = 'correct horse battery staple'

export function testConfig(
    dataDir = '/tmp/malang-test',
    overrides: Partial<AppConfig> = {},
): AppConfig {
    return {
        nodeEnv: 'test',
        autoBackupEnabled: false,
        host: '127.0.0.1',
        dataDir,
        databasePath: join(dataDir, 'data.sqlite'),
        adminPassword: TEST_ADMIN_PASSWORD,
        sessionSecret: 'test-session-secret-with-enough-entropy',
        allowedOrigins: new Set(),
        cookieSecure: false,
        port: 3000,
        logLevel: 'silent',
        logPretty: false,
        logColorize: false,
        limits: {
            importBytes: 128 << 20,
            jsonBytes: 8 << 20,
            assetBytes: 32 << 20,
            archiveEntries: 4096,
            uploadChunkBytes: 64 << 10,
        },
        ...overrides,
    }
}

export async function login(app: ReturnType<typeof createApp>, password: string) {
    const response = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
    })
    if (response.status !== 200) throw new Error(`login failed with status ${response.status}`)
    return response.headers.get('set-cookie')!.split(';')[0]!
}

export interface TestAppOptions {
    config?: Partial<AppConfig>
    login?: boolean
}

type SendInit = Omit<RequestInit, 'body'> & { body?: unknown }

export type TestApp = Awaited<ReturnType<typeof createTestApp>>

/** An app on its own temporary data folder and file-based SQLite database. */
export async function createTestApp(options: TestAppOptions = {}) {
    const dataDir = mkdtempSync(join(tmpdir(), 'malang-test-'))
    let config = testConfig(dataDir, options.config)
    let context = await createContext(config)
    let app = createApp(context)
    let password = config.adminPassword ?? TEST_ADMIN_PASSWORD
    const loggedIn = options.login ?? true

    const t = {
        get context(): AppContext {
            return context
        },
        get app() {
            return app
        },
        get config() {
            return config
        },
        dataDir,
        cookie: '',

        /** Raw request without the session cookie. */
        request(path: string, init?: RequestInit) {
            return app.request(path, init)
        },

        /** `/api/v1` + path with the session cookie; a non-string `body` is sent as JSON. */
        send(path: string, init: SendInit = {}) {
            const headers = new Headers(init.headers)
            if (t.cookie && !headers.has('cookie')) headers.set('cookie', t.cookie)
            let body = init.body as RequestInit['body']
            if (isJsonBody(init.body)) {
                if (!headers.has('content-type')) headers.set('content-type', 'application/json')
                body = JSON.stringify(init.body)
            }
            return app.request(`/api/v1${path}`, { ...init, headers, body })
        },

        /** `send` that fails on a non-2xx status and returns the parsed JSON (null for 204). */
        async call<T = unknown>(path: string, init?: SendInit): Promise<T> {
            const response = await t.send(path, init)
            if (!response.ok) {
                throw new Error(
                    `${init?.method ?? 'GET'} ${path} → ${response.status}: ${await response.text()}`,
                )
            }
            if (response.status === 204) return null as T
            return (await response.json()) as T
        },

        async login(next = password) {
            t.cookie = await login(app, next)
            password = next
            return t.cookie
        },

        /** Closes and reopens the context on the same data folder, then logs in again. */
        async reopen(overrides: Partial<AppConfig> = {}) {
            context.close()
            config = { ...config, ...overrides }
            context = await createContext(config)
            app = createApp(context)
            t.cookie = ''
            if (loggedIn) await t.login()
        },

        async close() {
            context.close()
            rmSync(dataDir, { recursive: true, force: true })
        },
    }

    if (loggedIn) await t.login()
    return t
}

function isJsonBody(body: unknown) {
    if (body === undefined || body === null || typeof body === 'string') return false
    return !(
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body) ||
        body instanceof Blob ||
        body instanceof FormData ||
        body instanceof URLSearchParams ||
        body instanceof ReadableStream
    )
}

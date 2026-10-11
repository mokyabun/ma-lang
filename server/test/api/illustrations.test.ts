import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BackgroundJob, IllustrationSettings, IllustrationTestResult } from '@malang/shared'
import { zipSync } from 'fflate'
import { z } from 'zod'

import { createApp } from '@/app'
import { createContext } from '@/bootstrap'
import type { AppContext } from '@/context'

import { appConfig } from '../support/fixtures'
import { login } from '../support/session'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9])
const NOVELAI_KEY = 'pst-novelai-secret-1234'

describe('illustration settings and test generation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-illustrations-'))
    const config = appConfig(directory)
    const originalFetch = globalThis.fetch
    let context: AppContext
    let app: ReturnType<typeof createApp>
    let cookie = ''

    const call = (path: string, init: { method?: string; body?: string } = {}) =>
        app.request(`/api/v1${path}`, {
            ...init,
            headers: { cookie, 'content-type': 'application/json' },
        })

    beforeAll(async () => {
        context = await createContext(config)
        app = createApp(context)
        cookie = await login(app, config.adminPassword!)
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    afterAll(() => {
        context.close()
        rmSync(directory, { recursive: true, force: true })
    })

    test('stores the NovelAI key encrypted and never returns it', async () => {
        const initial = (await (
            await call('/illustrations/settings')
        ).json()) as IllustrationSettings
        expect(initial).toMatchObject({
            imageProvider: 'novelai',
            novelaiEndpoint: 'https://image.novelai.net',
            novelaiApiKeyConfigured: false,
        })

        const response = await call('/illustrations/settings', {
            method: 'PATCH',
            body: JSON.stringify({
                novelaiApiKey: NOVELAI_KEY,
                defaultImageParams: { steps: 23, width: 1024, height: 1024 },
            }),
        })
        const text = await response.text()
        expect(response.status).toBe(200)
        expect(text).not.toContain(NOVELAI_KEY)
        expect(JSON.parse(text)).toMatchObject({
            novelaiApiKeyConfigured: true,
            novelaiApiKeyLocked: false,
            novelaiApiKeyHint: '••••1234',
            defaultImageParams: {
                steps: 23,
                width: 1024,
                height: 1024,
                sampler: 'k_euler_ancestral',
            },
        })

        const envelope = context.store.secretStorage.get().secrets.novelai!
        expect(envelope).toContain('AES-256-GCM')
        expect(envelope).not.toContain(NOVELAI_KEY)
    })

    test('rejects image sizes NovelAI cannot render', async () => {
        const response = await call('/illustrations/settings', {
            method: 'PATCH',
            body: JSON.stringify({ defaultImageParams: { width: 1000 } }),
        })
        expect(response.status).toBe(422)
    })

    test('generates a test image with defaults merged under the request', async () => {
        const bodies: unknown[] = []
        globalThis.fetch = (async (url: string, init: RequestInit & { body: string }) => {
            expect(url).toBe('https://image.novelai.net/ai/generate-image')
            expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${NOVELAI_KEY}`)
            bodies.push(JSON.parse(init.body))
            return new Response(zipSync({ 'image_0.png': png }))
        }) as unknown as typeof fetch

        const response = await call('/illustrations/test', {
            method: 'POST',
            body: JSON.stringify({
                positive: 'artist:foo, 1girl',
                characters: [{ prompt: '1girl, aria' }],
                params: { seed: 5 },
            }),
        })
        expect(response.status).toBe(200)
        const result = (await response.json()) as IllustrationTestResult
        expect(result).toMatchObject({ seed: 5, width: 1024, height: 1024 })
        expect(result.image).toBe(`data:image/png;base64,${Buffer.from(png).toString('base64')}`)
        expect(bodies[0]).toMatchObject({
            input: 'artist:foo, 1girl',
            parameters: {
                steps: 23,
                seed: 5,
                v4_prompt: { caption: { base_caption: 'artist:foo, 1girl' } },
            },
        })
    })

    test('maps NovelAI rejections to API errors', async () => {
        globalThis.fetch = (async () =>
            Response.json({ message: 'Unauthorized' }, { status: 401 })) as unknown as typeof fetch
        const response = await call('/illustrations/test', {
            method: 'POST',
            body: JSON.stringify({ positive: '1girl' }),
        })
        expect(response.status).toBe(401)
        expect(await response.json()).toMatchObject({ code: 'provider_auth' })
    })

    test('broadcasts job updates on the runtime event stream', async () => {
        context.jobs.define({
            kind: 'test.echo',
            payload: z.object({ value: z.string() }),
            run: async () => null,
        })
        const reader = context.events.subscribe(crypto.randomUUID()).getReader()
        await reader.read()

        const job = context.jobs.enqueue('test.echo', { value: 'x' })
        const statuses: string[] = []
        while (!statuses.includes('complete')) {
            const chunk = new TextDecoder().decode((await reader.read()).value)
            for (const line of chunk.split('\n')) {
                if (!line.startsWith('data: ')) continue
                const event = JSON.parse(line.slice(6)) as { name: string; data: BackgroundJob }
                expect(event).toMatchObject({ type: 'runtime.event', name: 'job.updated' })
                if (event.data.id === job.id) statuses.push(event.data.status)
            }
        }
        await reader.cancel()
        expect(statuses).toEqual(['queued', 'running', 'complete'])
        expect(await (await call(`/jobs/${job.id}`)).json()).toMatchObject({ status: 'complete' })
    })

    test('re-encrypts the NovelAI key when the admin password changes', async () => {
        const before = context.store.secretStorage.get().secrets.novelai
        const response = await call('/auth/password', {
            method: 'PATCH',
            body: JSON.stringify({
                currentPassword: config.adminPassword,
                newPassword: 'a brand new admin password',
            }),
        })
        expect(response.status).toBe(204)

        const after = context.store.secretStorage.get().secrets.novelai
        expect(after).not.toBe(before)
        // Signing in decrypts every stored secret, so it fails if the rotation broke one.
        cookie = await login(app, 'a brand new admin password')
        const settings = (await (
            await call('/illustrations/settings')
        ).json()) as IllustrationSettings
        expect(settings).toMatchObject({
            novelaiApiKeyConfigured: true,
            novelaiApiKeyLocked: false,
        })

        const cleared = await call('/illustrations/settings', {
            method: 'PATCH',
            body: JSON.stringify({ clearNovelaiApiKey: true }),
        })
        expect(await cleared.json()).toMatchObject({
            novelaiApiKeyConfigured: false,
            novelaiApiKeyHint: '',
        })
    })
})

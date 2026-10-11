import { afterAll, afterEach, describe, expect, test } from 'bun:test'

import type { BackgroundJob, IllustrationSettings, IllustrationTestResult } from '@malang/shared'
import { zipSync } from 'fflate'
import { z } from 'zod'

import { createTestApp } from '../../helpers/app'
import { mockFetch } from '../../helpers/fetch'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9])
const NOVELAI_KEY = 'pst-novelai-secret-1234'

const t = await createTestApp()
afterAll(() => t.close())

describe('illustration settings and test generation', () => {
    let restoreFetch = () => {}

    afterEach(() => restoreFetch())

    test('stores the NovelAI key encrypted and never returns it', async () => {
        const initial = (await (
            await t.send('/illustrations/settings')
        ).json()) as IllustrationSettings
        expect(initial).toMatchObject({
            imageProvider: 'novelai',
            novelaiEndpoint: 'https://image.novelai.net',
            novelaiApiKeyConfigured: false,
        })

        const response = await t.send('/illustrations/settings', {
            method: 'PATCH',
            body: {
                novelaiApiKey: NOVELAI_KEY,
                defaultImageParams: { steps: 23, width: 1024, height: 1024 },
            },
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

        const envelope = t.context.store.secretStorage.get().secrets.novelai!
        expect(envelope).toContain('AES-256-GCM')
        expect(envelope).not.toContain(NOVELAI_KEY)
    })

    test('rejects image sizes NovelAI cannot render', async () => {
        const response = await t.send('/illustrations/settings', {
            method: 'PATCH',
            body: { defaultImageParams: { width: 1000 } },
        })
        expect(response.status).toBe(422)
    })

    test('generates a test image with defaults merged under the request', async () => {
        const bodies: unknown[] = []
        restoreFetch = mockFetch(async (url, init) => {
            expect(url).toBe('https://image.novelai.net/ai/generate-image')
            expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${NOVELAI_KEY}`)
            bodies.push(JSON.parse(init?.body as string))
            return new Response(zipSync({ 'image_0.png': png }))
        })

        const response = await t.send('/illustrations/test', {
            method: 'POST',
            body: {
                positive: 'artist:foo, 1girl',
                characters: [{ prompt: '1girl, aria' }],
                params: { seed: 5 },
            },
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
        restoreFetch = mockFetch(async () =>
            Response.json({ message: 'Unauthorized' }, { status: 401 }),
        )
        const response = await t.send('/illustrations/test', {
            method: 'POST',
            body: { positive: '1girl' },
        })
        expect(response.status).toBe(401)
        expect(await response.json()).toMatchObject({ code: 'provider_auth' })
    })

    test('broadcasts job updates on the runtime event stream', async () => {
        t.context.jobs.define({
            kind: 'test.echo',
            payload: z.object({ value: z.string() }),
            run: async () => null,
        })
        const reader = t.context.events.subscribe(crypto.randomUUID()).getReader()
        await reader.read()

        const job = t.context.jobs.enqueue('test.echo', { value: 'x' })
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
        expect(await (await t.send(`/jobs/${job.id}`)).json()).toMatchObject({ status: 'complete' })
    })

    test('re-encrypts the NovelAI key when the admin password changes', async () => {
        const before = t.context.store.secretStorage.get().secrets.novelai
        const response = await t.send('/auth/password', {
            method: 'PATCH',
            body: {
                currentPassword: t.config.adminPassword,
                newPassword: 'a brand new admin password',
            },
        })
        expect(response.status).toBe(204)

        const after = t.context.store.secretStorage.get().secrets.novelai
        expect(after).not.toBe(before)
        // Signing in decrypts every stored secret, so it fails if the rotation broke one.
        await t.login('a brand new admin password')
        const settings = (await (
            await t.send('/illustrations/settings')
        ).json()) as IllustrationSettings
        expect(settings).toMatchObject({
            novelaiApiKeyConfigured: true,
            novelaiApiKeyLocked: false,
        })

        const cleared = await t.send('/illustrations/settings', {
            method: 'PATCH',
            body: { clearNovelaiApiKey: true },
        })
        expect(await cleared.json()).toMatchObject({
            novelaiApiKeyConfigured: false,
            novelaiApiKeyHint: '',
        })
    })
})

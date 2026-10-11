import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    GENERAL_CHAT_CHARACTER_ID,
    type GenerationRequest,
    illustrationTokenIds,
    type MessageIllustration,
    type RuntimeEvent,
} from '@malang/shared'
import { zipSync } from 'fflate'

import { createApp } from '@/app'
import { createContext } from '@/bootstrap'
import type { AppContext } from '@/context'

import { appConfig } from '../support/fixtures'
import { login } from '../support/session'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7])
const REPLY = 'Aria walks into the garden.\n\nShe hums quietly.\n\nNight falls over the house.'

const PLAN = JSON.stringify({
    illustrations: [
        { slot: 3, size: 'landscape', scene: 'night, house, outdoors', characters: [] },
        {
            slot: 1,
            size: 'portrait',
            scene: '1girl, garden, day',
            characters: [{ actor: 'aria', tags: 'smile, walking' }],
        },
    ],
    continuity: { outfits: [{ actor: 'aria', outfit: 'Pajamas', reason: 'evening' }] },
})

async function until(check: () => boolean, timeoutMs = 5_000) {
    const deadline = Date.now() + timeoutMs
    while (!check()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for the pipeline')
        await Bun.sleep(10)
    }
}

describe('illustration pipeline', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-illustration-pipeline-'))
    const originalFetch = globalThis.fetch
    const novelaiBodies: Array<{ input: string; parameters: Record<string, unknown> }> = []
    const events: RuntimeEvent[] = []
    let context: AppContext

    function echoPreset(message: string) {
        return context.store.modelPreset.create({
            name: `Echo ${crypto.randomUUID()}`,
            apiKeyId: null,
            config: {
                provider: 'echo',
                modelId: 'echo',
                defaults: {},
                providerOptions: { message },
            },
        })
    }

    function conversation(input: { auto: boolean; analysis?: string }) {
        const id = context.conversations.create({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: echoPreset(REPLY).id,
            greetingIndex: -1,
        }).id
        context.illustrationCatalog.saveConversationSettings(id, {
            enabled: true,
            mode: input.auto ? 'auto' : 'manual',
            count: { min: 1, max: 2 },
            styleId: null,
            analysisModelPresetId: input.analysis ? echoPreset(input.analysis).id : null,
            sceneDirection: '',
        })
        return id
    }

    async function generate(conversationId: string, mode: GenerationRequest['mode'] = 'reply') {
        const result = await context.generations.start(
            conversationId,
            {
                mode,
                content: mode === 'reply' ? 'Hello' : '',
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: crypto.randomUUID(),
            } as GenerationRequest,
            crypto.randomUUID(),
        )
        await new Response(result.stream).text()
        return context.store.message.lastAssistant(conversationId)!
    }

    const views = (conversationId: string) => context.illustrationPipeline.list(conversationId)
    const allComplete = (items: MessageIllustration[]) =>
        items.length > 0 && items.every((item) => item.status === 'complete')

    beforeAll(async () => {
        context = await createContext(appConfig(directory))
        const publish = context.events.publish.bind(context.events)
        context.events.publish = (event) => {
            events.push(event)
            publish(event)
        }
        await context.illustrations.updateSettings({
            novelaiApiKey: 'pst-pipeline',
            fixedPositive: '<<slot>>, no text',
            analysisModelPresetId: echoPreset(PLAN).id,
        })
        const style = context.illustrationCatalog.createStyle({
            name: 'Watercolor',
            sceneTemplate: 'artist:foo, <<slot>>',
            negative: 'lowres',
            params: { steps: 22 },
        })
        await context.illustrations.updateSettings({ defaultStyleId: style.id })
        context.illustrationCatalog.createActor(
            { characterId: GENERAL_CHAT_CHARACTER_ID },
            {
                name: 'Aria',
                keys: ['aria'],
                promptTemplate: '1girl, aria, <<slot>>, <<outfit>>',
                negative: 'short hair',
                enabled: true,
                outfits: [
                    {
                        name: 'uniform',
                        prompt: 'school uniform',
                        negative: '',
                        isDefault: true,
                        enabled: true,
                    },
                    {
                        name: 'pajamas',
                        prompt: 'white pajamas',
                        negative: 'shoes',
                        isDefault: false,
                        enabled: true,
                    },
                ],
            },
        )
        globalThis.fetch = (async (_url: string, init: RequestInit & { body: string }) => {
            novelaiBodies.push(JSON.parse(init.body))
            return new Response(zipSync({ 'image_0.png': png }))
        }) as unknown as typeof fetch
    })

    afterEach(() => {
        novelaiBodies.length = 0
        events.length = 0
    })

    afterAll(() => {
        globalThis.fetch = originalFetch
        context.close()
        rmSync(directory, { recursive: true, force: true })
    })

    test('plans and renders after an auto-mode response, keeping tokens in the run', async () => {
        const conversationId = conversation({ auto: true })
        const reply = await generate(conversationId)
        await until(() => allComplete(views(conversationId)))

        const message = context.store.message.get(reply.id)!
        const ids = illustrationTokenIds(message.content)
        expect(ids).toHaveLength(2)
        expect(message.content).toBe(
            `Aria walks into the garden.\n\n{{illustration::${ids[0]}}}\n\nShe hums quietly.\n\nNight falls over the house.\n\n{{illustration::${ids[1]}}}`,
        )
        expect(context.store.generation.listByMessage(reply.id).at(-1)?.processedOutputText).toBe(
            message.content,
        )

        const [garden, night] = ids.map((id) => context.store.messageIllustration.get(id)!)
        expect(garden).toMatchObject({
            slotIndex: 1,
            positive: 'artist:foo, 1girl, garden, day, no text',
            negative: 'lowres',
            characters: [
                {
                    prompt: '1girl, aria, smile, walking, white pajamas',
                    negative: 'short hair, shoes',
                },
            ],
            params: { steps: 22, width: 832, height: 1216 },
        })
        expect(night).toMatchObject({ slotIndex: 3, params: { width: 1216, height: 832 } })

        expect(novelaiBodies.map((body) => body.input).sort()).toEqual([
            'artist:foo, 1girl, garden, day, no text',
            'artist:foo, night, house, outdoors, no text',
        ])
        expect(views(conversationId).every((view) => view.assetId)).toBe(true)
        expect(events.some((event) => event.name === 'messages.changed')).toBe(true)
    })

    test('keeps the old output illustrations on regenerate and plans the new output', async () => {
        const conversationId = conversation({ auto: true })
        const first = await generate(conversationId)
        await until(() => allComplete(views(conversationId)))
        const oldIds = illustrationTokenIds(context.store.message.get(first.id)!.content)

        await generate(conversationId, 'regenerate')
        await until(() => views(conversationId).length === 4 && allComplete(views(conversationId)))

        const runs = context.store.generation.listByMessage(first.id)
        expect(illustrationTokenIds(runs[0]!.processedOutputText)).toEqual(oldIds)
        const newIds = illustrationTokenIds(context.store.message.get(first.id)!.content)
        expect(newIds).toHaveLength(2)
        expect(newIds.some((id) => oldIds.includes(id))).toBe(false)
    })

    test('waits for the button in manual mode and replaces earlier illustrations', async () => {
        const conversationId = conversation({ auto: false })
        const reply = await generate(conversationId)
        await Bun.sleep(50)
        expect(views(conversationId)).toEqual([])

        context.illustrationPipeline.request(conversationId, reply.id, { min: 1, max: 1 })
        await until(() => allComplete(views(conversationId)))
        // The plan has two entries; the one-image count keeps only the first by slot.
        expect(views(conversationId).map((view) => view.slotIndex)).toEqual([1])

        context.illustrationPipeline.request(conversationId, reply.id)
        await until(() => views(conversationId).length === 2 && allComplete(views(conversationId)))
        const content = context.store.message.get(reply.id)!.content
        expect(illustrationTokenIds(content).sort()).toEqual(
            views(conversationId)
                .map((view) => view.id)
                .sort(),
        )
    })

    test('fails the plan when the analysis stays unusable after one repair', async () => {
        const conversationId = conversation({ auto: true, analysis: 'I cannot answer in JSON.' })
        const reply = await generate(conversationId)
        await until(() =>
            events.some(
                (event) =>
                    event.name === 'job.updated' &&
                    event.data.messageId === reply.id &&
                    event.data.status === 'failed',
            ),
        )
        expect(views(conversationId)).toEqual([])
        expect(context.store.message.get(reply.id)!.content).toBe(REPLY)
    })

    test('marks a render failed when NovelAI rejects the key, and retries it on request', async () => {
        const conversationId = conversation({ auto: false })
        const reply = await generate(conversationId)
        const working = globalThis.fetch
        globalThis.fetch = (async () =>
            new Response('Unauthorized', { status: 401 })) as unknown as typeof fetch
        context.illustrationPipeline.request(conversationId, reply.id, { min: 1, max: 1 })
        await until(() => views(conversationId)[0]?.status === 'failed')
        expect(views(conversationId)[0]!.error).toContain('NovelAI rejected the API key')

        globalThis.fetch = working
        context.illustrationPipeline.retry(views(conversationId)[0]!.id)
        await until(() => allComplete(views(conversationId)))
    })

    test('cancels jobs and drops illustrations when the message is deleted', async () => {
        const conversationId = conversation({ auto: false })
        const reply = await generate(conversationId)
        const job = context.illustrationPipeline.request(conversationId, reply.id)

        context.store.message.delete(reply.id)
        context.illustrationPipeline.handleMessagesRemoved(conversationId)

        await until(() => {
            const status = context.store.backgroundJob.get(job.id)?.status
            return status === 'cancelled' || status === 'complete'
        })
        await Bun.sleep(50)
        expect(views(conversationId)).toEqual([])
    })

    test('exposes the button and the list over HTTP', async () => {
        const app = createApp(context)
        const cookie = await login(app, appConfig(directory).adminPassword!)
        const call = (path: string, body?: unknown) =>
            app.request(`/api/v1/conversations/${path}`, {
                method: body === undefined ? 'GET' : 'POST',
                body: body === undefined ? undefined : JSON.stringify(body),
                headers: { cookie, 'content-type': 'application/json' },
            })
        const conversationId = conversation({ auto: false })
        const reply = await generate(conversationId)
        const user = context.store.message
            .list(conversationId)
            .find((message) => message.role === 'user')!

        expect((await call(`${conversationId}/messages/${user.id}/illustrations`, {})).status).toBe(
            422,
        )
        const started = await call(`${conversationId}/messages/${reply.id}/illustrations`, {
            count: { min: 1, max: 1 },
        })
        expect(started.status).toBe(202)
        expect(await started.json()).toMatchObject({ kind: 'illustration.plan', status: 'queued' })
        await until(() => allComplete(views(conversationId)))

        const listed = (await (await call(`${conversationId}/illustrations`)).json()) as {
            illustrations: MessageIllustration[]
        }
        expect(listed.illustrations).toHaveLength(1)
        expect(listed.illustrations[0]).toMatchObject({ messageId: reply.id, status: 'complete' })
    })
})

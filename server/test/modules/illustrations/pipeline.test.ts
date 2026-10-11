import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'

import {
    GENERAL_CHAT_CHARACTER_ID,
    type GenerationRequest,
    illustrationTokenIds,
    type MessageIllustration,
    type RuntimeEvent,
} from '@malang/shared'
import { zipSync } from 'fflate'

import { createTestApp } from '../../helpers/app'
import { mockFetch } from '../../helpers/fetch'
import { createConversation, createEchoPreset } from '../../helpers/fixtures'

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

const t = await createTestApp()
afterAll(() => t.close())

describe('illustration pipeline', () => {
    const novelaiBodies: Array<{ input: string; parameters: Record<string, unknown> }> = []
    const events: RuntimeEvent[] = []
    let restoreFetch = () => {}

    function echoPreset(message: string) {
        return createEchoPreset(t, { message })
    }

    function conversation(input: { auto: boolean; analysis?: string }) {
        const id = createConversation(t, { modelPresetId: echoPreset(REPLY).id }).id
        t.context.illustrationCatalog.saveConversationSettings(id, {
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
        const result = await t.context.generations.start(
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
        return t.context.store.message.lastAssistant(conversationId)!
    }

    const views = (conversationId: string) => t.context.illustrationPipeline.list(conversationId)
    const allComplete = (items: MessageIllustration[]) =>
        items.length > 0 && items.every((item) => item.status === 'complete')

    beforeAll(async () => {
        const publish = t.context.events.publish.bind(t.context.events)
        t.context.events.publish = (event) => {
            events.push(event)
            publish(event)
        }
        await t.context.illustrations.updateSettings({
            novelaiApiKey: 'pst-pipeline',
            fixedPositive: '<<slot>>, no text',
            analysisModelPresetId: echoPreset(PLAN).id,
        })
        const style = t.context.illustrationCatalog.createStyle({
            name: 'Watercolor',
            sceneTemplate: 'artist:foo, <<slot>>',
            negative: 'lowres',
            params: { steps: 22 },
        })
        await t.context.illustrations.updateSettings({ defaultStyleId: style.id })
        t.context.illustrationCatalog.createActor(
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
        restoreFetch = mockFetch(async (_url, init) => {
            novelaiBodies.push(JSON.parse(init?.body as string))
            return new Response(zipSync({ 'image_0.png': png }))
        })
    })

    afterEach(() => {
        novelaiBodies.length = 0
        events.length = 0
    })

    afterAll(() => restoreFetch())

    test('plans and renders after an auto-mode response, keeping tokens in the run', async () => {
        const conversationId = conversation({ auto: true })
        const reply = await generate(conversationId)
        await until(() => allComplete(views(conversationId)))

        const message = t.context.store.message.get(reply.id)!
        const ids = illustrationTokenIds(message.content)
        expect(ids).toHaveLength(2)
        expect(message.content).toBe(
            `Aria walks into the garden.\n\n{{illustration::${ids[0]}}}\n\nShe hums quietly.\n\nNight falls over the house.\n\n{{illustration::${ids[1]}}}`,
        )
        expect(t.context.store.generation.listByMessage(reply.id).at(-1)?.processedOutputText).toBe(
            message.content,
        )

        const [garden, night] = ids.map((id) => t.context.store.messageIllustration.get(id)!)
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
        const oldIds = illustrationTokenIds(t.context.store.message.get(first.id)!.content)

        await generate(conversationId, 'regenerate')
        await until(() => views(conversationId).length === 4 && allComplete(views(conversationId)))

        const runs = t.context.store.generation.listByMessage(first.id)
        expect(illustrationTokenIds(runs[0]!.processedOutputText)).toEqual(oldIds)
        const newIds = illustrationTokenIds(t.context.store.message.get(first.id)!.content)
        expect(newIds).toHaveLength(2)
        expect(newIds.some((id) => oldIds.includes(id))).toBe(false)
    })

    test('waits for the button in manual mode and replaces earlier illustrations', async () => {
        const conversationId = conversation({ auto: false })
        const reply = await generate(conversationId)
        await Bun.sleep(50)
        expect(views(conversationId)).toEqual([])

        t.context.illustrationPipeline.request(conversationId, reply.id, { min: 1, max: 1 })
        await until(() => allComplete(views(conversationId)))
        // The plan has two entries; the one-image count keeps only the first by slot.
        expect(views(conversationId).map((view) => view.slotIndex)).toEqual([1])

        t.context.illustrationPipeline.request(conversationId, reply.id)
        await until(() => views(conversationId).length === 2 && allComplete(views(conversationId)))
        const content = t.context.store.message.get(reply.id)!.content
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
        expect(t.context.store.message.get(reply.id)!.content).toBe(REPLY)
    })

    test('marks a render failed when NovelAI rejects the key, and retries it on request', async () => {
        const conversationId = conversation({ auto: false })
        const reply = await generate(conversationId)
        const restoreWorking = mockFetch(async () => new Response('Unauthorized', { status: 401 }))
        t.context.illustrationPipeline.request(conversationId, reply.id, { min: 1, max: 1 })
        await until(() => views(conversationId)[0]?.status === 'failed')
        expect(views(conversationId)[0]!.error).toContain('NovelAI rejected the API key')

        restoreWorking()
        t.context.illustrationPipeline.retry(views(conversationId)[0]!.id)
        await until(() => allComplete(views(conversationId)))
    })

    test('cancels jobs and drops illustrations when the message is deleted', async () => {
        const conversationId = conversation({ auto: false })
        const reply = await generate(conversationId)
        const job = t.context.illustrationPipeline.request(conversationId, reply.id)

        t.context.store.message.delete(reply.id)
        t.context.illustrationPipeline.handleMessagesRemoved(conversationId)

        await until(() => {
            const status = t.context.store.backgroundJob.get(job.id)?.status
            return status === 'cancelled' || status === 'complete'
        })
        await Bun.sleep(50)
        expect(views(conversationId)).toEqual([])
    })

    test('exposes the button and the list over HTTP', async () => {
        const conversationId = conversation({ auto: false })
        const reply = await generate(conversationId)
        const user = t.context.store.message
            .list(conversationId)
            .find((message) => message.role === 'user')!

        expect(
            (
                await t.send(`/conversations/${conversationId}/messages/${user.id}/illustrations`, {
                    method: 'POST',
                    body: {},
                })
            ).status,
        ).toBe(422)
        const started = await t.send(
            `/conversations/${conversationId}/messages/${reply.id}/illustrations`,
            {
                method: 'POST',
                body: { count: { min: 1, max: 1 } },
            },
        )
        expect(started.status).toBe(202)
        expect(await started.json()).toMatchObject({ kind: 'illustration.plan', status: 'queued' })
        await until(() => allComplete(views(conversationId)))

        const listed = (await (
            await t.send(`/conversations/${conversationId}/illustrations`)
        ).json()) as {
            illustrations: MessageIllustration[]
        }
        expect(listed.illustrations).toHaveLength(1)
        expect(listed.illustrations[0]).toMatchObject({ messageId: reply.id, status: 'complete' })
    })
})

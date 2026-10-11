import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    type ConversationContinuity,
    GENERAL_CHAT_CHARACTER_ID,
    type GenerationRequest,
    type IllustrationActor,
} from '@malang/shared'
import { zipSync } from 'fflate'

import { createApp } from '@/app'
import { createContext } from '@/bootstrap'
import type { AppContext } from '@/context'

import { testConfig } from '../helpers/app'
import { login } from '../helpers/app'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 3])

async function until(check: () => boolean, timeoutMs = 5_000) {
    const deadline = Date.now() + timeoutMs
    while (!check()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for the pipeline')
        await Bun.sleep(10)
    }
}

function analysis(continuity: unknown, illustrations: unknown[] = []) {
    return JSON.stringify({ illustrations, continuity })
}

describe('illustration continuity', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-illustration-continuity-'))
    const config = testConfig(directory)
    const originalFetch = globalThis.fetch
    const novelaiInputs: Array<{ characterPrompts: Array<{ prompt: string }> }> = []
    let context: AppContext
    let app: ReturnType<typeof createApp>
    let cookie = ''
    let aria: IllustrationActor

    const call = (path: string, method = 'GET', body?: unknown) =>
        app.request(`/api/v1${path}`, {
            method,
            body: body === undefined ? undefined : JSON.stringify(body),
            headers: { cookie, 'content-type': 'application/json' },
        })

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
        }).id
    }

    function conversation(mode: 'auto' | 'manual') {
        const id = context.conversations.create({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: echoPreset('Aria steps out into the rain.\n\nShe laughs.'),
            greetingIndex: -1,
        }).id
        setAnalysis(id, mode, analysis({}))
        return id
    }

    function setAnalysis(conversationId: string, mode: 'auto' | 'manual', reply: string) {
        context.illustrationCatalog.saveConversationSettings(conversationId, {
            enabled: true,
            mode,
            count: { min: 1, max: 1 },
            styleId: null,
            analysisModelPresetId: echoPreset(reply),
            sceneDirection: '',
        })
    }

    async function generate(conversationId: string, mode: GenerationRequest['mode'] = 'reply') {
        const result = await context.generations.start(
            conversationId,
            {
                mode,
                content: mode === 'reply' ? 'Hi' : '',
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: crypto.randomUUID(),
            } as GenerationRequest,
            crypto.randomUUID(),
        )
        await new Response(result.stream).text()
        return context.store.message.lastAssistant(conversationId)!
    }

    async function continuity(conversationId: string) {
        return (await (
            await call(`/conversations/${conversationId}/continuity`)
        ).json()) as ConversationContinuity
    }

    function idleJobs(conversationId: string) {
        return context.jobs.listActive({ conversationId }).length === 0
    }

    beforeAll(async () => {
        context = await createContext(config)
        app = createApp(context)
        cookie = await login(app, config.adminPassword!)
        await context.illustrations.updateSettings({ novelaiApiKey: 'pst-continuity' })
        aria = context.illustrationCatalog.createActor(
            { characterId: GENERAL_CHAT_CHARACTER_ID },
            {
                name: 'Aria',
                keys: ['aria'],
                promptTemplate: '1girl, aria, <<slot>>, <<outfit>>, <<state>>',
                negative: '',
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
                        name: 'coat',
                        prompt: 'raincoat',
                        negative: '',
                        isDefault: false,
                        enabled: true,
                    },
                ],
            },
        )
        globalThis.fetch = (async (_url: string, init: RequestInit & { body: string }) => {
            novelaiInputs.push(JSON.parse(init.body).parameters)
            return new Response(zipSync({ 'image_0.png': png }))
        }) as unknown as typeof fetch
    })

    afterAll(() => {
        globalThis.fetch = originalFetch
        context.close()
        rmSync(directory, { recursive: true, force: true })
    })

    test('manages global and character state definitions', async () => {
        const wet = {
            key: 'wet',
            label: '젖음',
            instruction: 'Set when soaked; clear when dry.',
            kind: 'flag',
            tags: 'wet, wet hair',
            options: [],
            thresholds: [],
            lifetimeTurns: 2,
        }
        expect(
            (await call('/illustrations/state-definitions', 'POST', { ...wet, characterId: null }))
                .status,
        ).toBe(201)
        expect(
            (await call('/illustrations/state-definitions', 'POST', { ...wet, characterId: null }))
                .status,
        ).toBe(409)
        const local = await call('/illustrations/state-definitions', 'POST', {
            ...wet,
            key: 'mood',
            kind: 'choice',
            options: [{ value: 'happy', tags: 'smile' }],
            lifetimeTurns: null,
            characterId: GENERAL_CHAT_CHARACTER_ID,
        })
        expect(local.status).toBe(201)
        const invalidChoice = await call('/illustrations/state-definitions', 'POST', {
            ...wet,
            key: 'empty',
            kind: 'choice',
            characterId: null,
        })
        expect(invalidChoice.status).toBe(422)

        const listed = (await (await call('/illustrations/state-definitions')).json()) as {
            definitions: Array<{ key: string }>
        }
        expect(listed.definitions.map((item) => item.key)).toEqual(['wet'])
        const scoped = (await (
            await call(`/illustrations/state-definitions?characterId=${GENERAL_CHAT_CHARACTER_ID}`)
        ).json()) as { definitions: Array<{ key: string }> }
        expect(scoped.definitions.map((item) => item.key)).toEqual(['mood'])
    })

    test('carries outfits and states into prompts and the next response', async () => {
        const conversationId = conversation('auto')
        setAnalysis(
            conversationId,
            'auto',
            analysis(
                {
                    present: ['aria'],
                    newOutfits: [{ actor: 'aria', name: 'swimsuit', tags: 'black swimsuit' }],
                    states: [
                        { actor: 'aria', key: 'wet', op: 'set' },
                        { actor: 'aria', key: 'mood', op: 'choose', value: 'happy' },
                    ],
                },
                [{ slot: 1, scene: 'rain', characters: [{ actor: 'aria', tags: 'laughing' }] }],
            ),
        )
        const first = await generate(conversationId)
        await until(() => idleJobs(conversationId))

        expect(novelaiInputs.at(-1)!.characterPrompts[0]!.prompt).toBe(
            '1girl, aria, laughing, black swimsuit, wet, wet hair, smile',
        )
        const afterFirst = await continuity(conversationId)
        const swimsuit = afterFirst.actors[0]!.outfits.find((outfit) => outfit.name === 'swimsuit')!
        expect(swimsuit.conversationId).toBe(conversationId)
        expect(afterFirst).toMatchObject({
            source: 'analysis',
            snapshotMessageId: first.id,
            state: {
                present: [aria.id],
                outfits: { [aria.id]: { outfitId: swimsuit.id, locked: false } },
                states: {
                    [aria.id]: {
                        wet: { value: true, expiresAfterTurn: 2 },
                        mood: { value: 'happy' },
                    },
                },
                turn: 1,
            },
        })

        // The user locks the swimsuit; the next analysis tries to change it anyway.
        const locked = await call(`/conversations/${conversationId}/continuity`, 'PUT', {
            present: [aria.id],
            outfits: { [aria.id]: { outfitId: swimsuit.id, locked: true } },
            states: afterFirst.state.states,
        })
        expect(locked.status).toBe(200)
        expect(((await locked.json()) as ConversationContinuity).source).toBe('manual')

        setAnalysis(
            conversationId,
            'auto',
            analysis({ outfits: [{ actor: 'aria', outfit: 'coat' }] }, [
                { slot: 2, scene: 'indoors', characters: [{ actor: 'aria', tags: 'sitting' }] },
            ]),
        )
        await generate(conversationId)
        await until(() => idleJobs(conversationId))
        expect(novelaiInputs.at(-1)!.characterPrompts[0]!.prompt).toBe(
            '1girl, aria, sitting, black swimsuit, wet, wet hair, smile',
        )

        // A third response: the two-turn "wet" flag has run out.
        setAnalysis(
            conversationId,
            'auto',
            analysis({}, [
                { slot: 1, scene: 'night', characters: [{ actor: 'aria', tags: 'sleeping' }] },
            ]),
        )
        await generate(conversationId)
        await until(() => idleJobs(conversationId))
        expect(novelaiInputs.at(-1)!.characterPrompts[0]!.prompt).toBe(
            '1girl, aria, sleeping, black swimsuit, smile',
        )

        const promoted = await call(`/illustrations/outfits/${swimsuit.id}/promote`, 'POST')
        expect(await promoted.json()).toMatchObject({ id: swimsuit.id, conversationId: null })
        expect(
            context.store.illustrationActor.get(aria.id)!.outfits.map((outfit) => outfit.name),
        ).toContain('swimsuit')
    })

    test('falls back to the earlier state while a regenerated output has none', async () => {
        const conversationId = conversation('manual')
        setAnalysis(
            conversationId,
            'manual',
            analysis({ states: [{ actor: 'aria', key: 'mood', op: 'choose', value: 'happy' }] }),
        )
        context.store.illustrationSettings.update({ continuityTracking: 'every-message' })
        try {
            const reply = await generate(conversationId)
            await until(() => idleJobs(conversationId))
            const tracked = await continuity(conversationId)
            expect(tracked.snapshotMessageId).toBe(reply.id)
            expect(tracked.state.states[aria.id]?.mood?.value).toBe('happy')
            // Continuity-only tracking never adds illustrations.
            expect(context.illustrationPipeline.list(conversationId)).toEqual([])

            setAnalysis(conversationId, 'manual', analysis({}))
            context.store.illustrationSettings.update({ continuityTracking: 'with-illustration' })
            context.store.conversation.update(conversationId, {
                modelPresetId: echoPreset('A different take on the scene.'),
            })
            await generate(conversationId, 'regenerate')
            await until(() => idleJobs(conversationId))
            const regenerated = await continuity(conversationId)
            expect(regenerated.source).toBeNull()
            expect(regenerated.state.states).toEqual({})

            const [original] = context.store.generation.listByMessage(reply.id)
            context.generations.selectOutput(reply.id, original!.id)
            expect((await continuity(conversationId)).state.states[aria.id]?.mood?.value).toBe(
                'happy',
            )
        } finally {
            context.store.illustrationSettings.update({ continuityTracking: 'with-illustration' })
        }
    })

    test('rejects hand edits that name unknown actors, outfits or states', async () => {
        const conversationId = conversation('manual')
        await generate(conversationId)
        const put = (body: unknown) =>
            call(`/conversations/${conversationId}/continuity`, 'PUT', body)
        const base = { present: [], outfits: {}, states: {} }

        expect((await put({ ...base, present: [crypto.randomUUID()] })).status).toBe(422)
        expect(
            (
                await put({
                    ...base,
                    outfits: { [aria.id]: { outfitId: crypto.randomUUID(), locked: true } },
                })
            ).status,
        ).toBe(422)
        expect(
            (await put({ ...base, states: { [aria.id]: { hunger: { value: true } } } })).status,
        ).toBe(422)
        expect(
            (await put({ ...base, states: { [aria.id]: { mood: { value: 'sad' } } } })).status,
        ).toBe(422)
        expect((await put(base)).status).toBe(200)
    })
})

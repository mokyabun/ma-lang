import { afterAll, afterEach, describe, expect, test } from 'bun:test'

import {
    type ConversationIllustrationSettings,
    GENERAL_CHAT_CHARACTER_ID,
    type IllustrationActor,
    type IllustrationActorInput,
    type IllustrationSettings,
    type IllustrationStyle,
} from '@malang/shared'
import { zipSync } from 'fflate'

import { createTestApp } from '../../helpers/app'
import { mockFetch } from '../../helpers/fetch'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])

const aria: IllustrationActorInput = {
    name: 'Aria',
    keys: ['aria', '아리아'],
    promptTemplate: '1girl, aria, silver hair, <<slot>>, <<outfit>>',
    negative: 'short hair',
    enabled: true,
    outfits: [
        { name: 'uniform', prompt: 'school uniform', negative: '', isDefault: true, enabled: true },
        { name: 'pajamas', prompt: 'white pajamas', negative: '', isDefault: false, enabled: true },
    ],
}

const t = await createTestApp()
afterAll(() => t.close())

describe('illustration styles, actors, and conversation settings', () => {
    let restoreFetch = () => {}

    async function createStyle(name: string) {
        const response = await t.send('/illustrations/styles', {
            method: 'POST',
            body: {
                name,
                sceneTemplate: 'artist:foo, <<slot>>, masterpiece',
                negative: 'lowres',
                params: { steps: 20 },
            },
        })
        expect(response.status).toBe(201)
        return (await response.json()) as IllustrationStyle
    }

    afterEach(() => restoreFetch())

    test('saves global settings and validates references', async () => {
        const response = await t.send('/illustrations/settings', {
            method: 'PATCH',
            body: {
                defaultMode: 'auto',
                defaultCount: { min: 1, max: 3 },
                fixedPositive: '<<slot>>, no text',
                sizePresets: [{ name: 'tall', width: 768, height: 1344 }],
            },
        })
        expect(await response.json()).toMatchObject({
            defaultMode: 'auto',
            defaultCount: { min: 1, max: 3 },
            fixedPositive: '<<slot>>, no text',
            sizePresets: [{ name: 'tall', width: 768, height: 1344 }],
            continuityTracking: 'with-illustration',
        })

        const missing = await t.send('/illustrations/settings', {
            method: 'PATCH',
            body: { defaultStyleId: crypto.randomUUID() },
        })
        expect(missing.status).toBe(422)
        const inverted = await t.send('/illustrations/settings', {
            method: 'PATCH',
            body: { defaultCount: { min: 3, max: 1 } },
        })
        expect(inverted.status).toBe(422)
    })

    test('creates, updates, and deletes styles, clearing the default style', async () => {
        const style = await createStyle('Watercolor')
        expect(style).toMatchObject({ name: 'Watercolor', params: { steps: 20 }, sortOrder: 0 })
        expect((await createStyle('Ink')).sortOrder).toBe(1)

        await t.send('/illustrations/settings', {
            method: 'PATCH',
            body: { defaultStyleId: style.id },
        })
        const updated = await t.send(`/illustrations/styles/${style.id}`, {
            method: 'PUT',
            body: { ...style, name: 'Soft watercolor', params: { scale: 6 } },
        })
        expect(await updated.json()).toMatchObject({
            name: 'Soft watercolor',
            params: { scale: 6 },
        })

        expect(
            (await t.send(`/illustrations/styles/${style.id}`, { method: 'DELETE' })).status,
        ).toBe(204)
        const settings = (await (
            await t.send('/illustrations/settings')
        ).json()) as IllustrationSettings
        expect(settings.defaultStyleId).toBeNull()
        const list = (await (await t.send('/illustrations/styles')).json()) as {
            styles: IllustrationStyle[]
        }
        expect(list.styles.map((item) => item.name)).toEqual(['Ink'])
    })

    test('test-renders a style through the fixed prompts and style parameters', async () => {
        await t.context.illustrations.updateSettings({ novelaiApiKey: 'pst-catalog-key' })
        const style = await createStyle('Test style')
        const bodies: Array<{ input: string; parameters: Record<string, unknown> }> = []
        restoreFetch = mockFetch(async (_url, init) => {
            bodies.push(JSON.parse(init?.body as string))
            return new Response(zipSync({ 'image_0.png': png }))
        })

        const response = await t.send(`/illustrations/styles/${style.id}/test`, {
            method: 'POST',
            body: { scene: '1girl, garden', characters: [{ prompt: '1girl, aria, smile' }] },
        })
        expect(response.status).toBe(200)
        expect(bodies[0]!.input).toBe('artist:foo, 1girl, garden, masterpiece, no text')
        expect(bodies[0]!.parameters).toMatchObject({
            steps: 20,
            negative_prompt: 'lowres',
            characterPrompts: [{ prompt: '1girl, aria, smile', uc: '' }],
        })
    })

    test('manages character actors and keeps outfit ids across saves', async () => {
        const created = await t.send('/illustrations/actors', {
            method: 'POST',
            body: { ...aria, characterId: GENERAL_CHAT_CHARACTER_ID },
        })
        expect(created.status).toBe(201)
        const actor = (await created.json()) as IllustrationActor
        expect(actor.outfits.map((outfit) => outfit.name)).toEqual(['uniform', 'pajamas'])

        const [uniform] = actor.outfits
        const saved = await t.send(`/illustrations/actors/${actor.id}`, {
            method: 'PUT',
            body: {
                ...aria,
                name: 'Aria Vale',
                outfits: [
                    { ...uniform, prompt: 'blue school uniform' },
                    {
                        name: 'swimsuit',
                        prompt: 'one-piece',
                        negative: '',
                        isDefault: false,
                        enabled: true,
                    },
                ],
            },
        })
        const updated = (await saved.json()) as IllustrationActor
        expect(updated.name).toBe('Aria Vale')
        expect(updated.outfits.map((outfit) => [outfit.name, outfit.prompt])).toEqual([
            ['uniform', 'blue school uniform'],
            ['swimsuit', 'one-piece'],
        ])
        expect(updated.outfits[0]!.id).toBe(uniform!.id)

        const listed = (await (
            await t.send(`/illustrations/actors?characterId=${GENERAL_CHAT_CHARACTER_ID}`)
        ).json()) as { actors: IllustrationActor[] }
        expect(listed.actors.map((item) => item.id)).toEqual([actor.id])

        const twoDefaults = await t.send(`/illustrations/actors/${actor.id}`, {
            method: 'PUT',
            body: {
                ...aria,
                outfits: aria.outfits.map((outfit) => ({ ...outfit, isDefault: true })),
            },
        })
        expect(twoDefaults.status).toBe(422)
        expect((await t.send('/illustrations/actors')).status).toBe(422)
    })

    test('allows one actor per persona and removes it with the persona', async () => {
        const persona = (await (
            await t.send('/personas', { method: 'POST', body: { name: 'Mina', description: '' } })
        ).json()) as { id: string }
        const body = { ...aria, name: 'Mina', outfits: [], personaId: persona.id }

        expect((await t.send('/illustrations/actors', { method: 'POST', body })).status).toBe(201)
        expect((await t.send('/illustrations/actors', { method: 'POST', body })).status).toBe(409)

        await t.send(`/personas/${persona.id}`, { method: 'DELETE' })
        expect(t.context.store.illustrationActor.list({ personaId: persona.id })).toEqual([])
    })

    test('reads conversation defaults until saved, then keeps its own settings', async () => {
        const conversation = (await (
            await t.send('/conversations', {
                method: 'POST',
                body: { characterId: GENERAL_CHAT_CHARACTER_ID },
            })
        ).json()) as { id: string }
        const path = `/conversations/${conversation.id}/illustration-settings`

        expect(await (await t.send(path)).json()).toEqual({
            conversationId: conversation.id,
            enabled: false,
            mode: 'auto',
            count: { min: 1, max: 3 },
            styleId: null,
            analysisModelPresetId: null,
            sceneDirection: '',
        })

        const style = await createStyle('Conversation style')
        const saved = await t.send(path, {
            method: 'PUT',
            body: {
                enabled: true,
                mode: 'manual',
                count: { min: 2, max: 2 },
                styleId: style.id,
                analysisModelPresetId: null,
                sceneDirection: 'Prefer wide shots.',
            },
        })
        expect(await saved.json()).toMatchObject({ enabled: true, styleId: style.id })

        await t.send(`/illustrations/styles/${style.id}`, { method: 'DELETE' })
        const after = (await (await t.send(path)).json()) as ConversationIllustrationSettings
        expect(after).toMatchObject({ enabled: true, mode: 'manual', styleId: null })
        expect(
            (await t.send(`/conversations/${crypto.randomUUID()}/illustration-settings`)).status,
        ).toBe(404)
    })
})

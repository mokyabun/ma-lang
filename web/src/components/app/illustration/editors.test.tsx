import { describe, expect, test } from 'bun:test'

import { DEFAULT_NOVELAI_IMAGE_PARAMS, type IllustrationActor } from '@malang/shared'
import { renderToStaticMarkup } from 'react-dom/server'

import { ActorEditor } from './actor-editor'
import { CountFields } from './count-fields'
import { ImageParamsFields } from './image-params-fields'

const actor: IllustrationActor = {
    id: '11111111-1111-4111-8111-111111111111',
    characterId: '22222222-2222-4222-8222-222222222222',
    personaId: null,
    name: 'Aria',
    keys: ['aria', '아리아'],
    promptTemplate: '1girl, aria, <<slot>>, <<outfit>>',
    negative: 'short hair',
    enabled: true,
    sortOrder: 0,
    outfits: [
        {
            id: '33333333-3333-4333-8333-333333333333',
            actorId: '11111111-1111-4111-8111-111111111111',
            conversationId: null,
            name: 'pajamas',
            prompt: 'white pajamas',
            negative: '',
            isDefault: true,
            enabled: true,
            sortOrder: 0,
        },
    ],
    createdAt: '',
    updatedAt: '',
}

describe('illustration editors', () => {
    test('render an actor with its keys, template and outfits', () => {
        const html = renderToStaticMarkup(<ActorEditor actor={actor} onSaved={() => {}} />)
        expect(html).toContain('value="aria, 아리아"')
        expect(html).toContain('1girl, aria, &lt;&lt;slot&gt;&gt;, &lt;&lt;outfit&gt;&gt;')
        expect(html).toContain('value="pajamas"')
        expect(html).toContain('aria-pressed="true"')
        expect(html).not.toContain('인물 삭제')
    })

    test('show inherited defaults as placeholders for style parameters', () => {
        const html = renderToStaticMarkup(
            <ImageParamsFields
                value={{ steps: 20 }}
                fallback={DEFAULT_NOVELAI_IMAGE_PARAMS}
                onChange={() => {}}
            />,
        )
        expect(html).toContain('value="20"')
        expect(html).toContain('placeholder="기본값 1216"')
        expect(html).toContain('placeholder="기본값 무작위"')
    })

    test('describe a fixed and a ranged count', () => {
        expect(
            renderToStaticMarkup(<CountFields value={{ min: 2, max: 2 }} onChange={() => {}} />),
        ).toContain('응답마다 2장')
        expect(
            renderToStaticMarkup(<CountFields value={{ min: 1, max: 3 }} onChange={() => {}} />),
        ).toContain('1~3장')
    })
})

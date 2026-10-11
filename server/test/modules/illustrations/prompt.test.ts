import { describe, expect, test } from 'bun:test'

import { DEFAULT_NOVELAI_IMAGE_PARAMS } from '@malang/shared'

import {
    composePrompt,
    fillTemplate,
    normalizeTags,
    resolveImageParams,
    splitTags,
    wrapFixed,
} from '@/modules/illustrations/prompt'

describe('tag normalization', () => {
    test('tidies separators and drops empty tags', () => {
        expect(normalizeTags(' 1girl ,,  long   hair,\n smile ,')).toBe('1girl, long hair, smile')
    })

    test('keeps the first of tags that differ only in case, spaces or underscores', () => {
        expect(normalizeTags('Long_Hair, long hair, LONG HAIR, longhair, smile')).toBe(
            'Long_Hair, smile',
        )
    })

    test('keeps weight syntax intact, including commas inside it', () => {
        expect(splitTags('{red, blue} eyes, 1.2::smile, blush::, [hat]')).toEqual([
            '{red, blue} eyes',
            ' 1.2::smile, blush::',
            ' [hat]',
        ])
        expect(normalizeTags('smile, {smile}, 1.2::smile::, -1::hat, scarf::')).toBe(
            'smile, {smile}, 1.2::smile::, -1::hat, scarf::',
        )
    })

    test('treats a single colon as part of a tag', () => {
        expect(normalizeTags('artist:foo, artist:foo')).toBe('artist:foo')
    })
})

describe('template filling', () => {
    test('replaces the slot in place', () => {
        expect(
            fillTemplate('artist:foo, <<slot>>, very aesthetic', { slot: '2girls, night' }),
        ).toBe('artist:foo, 2girls, night, very aesthetic')
    })

    test('appends the slot when the template has none', () => {
        expect(fillTemplate('masterpiece', { slot: 'bedroom' })).toBe('masterpiece, bedroom')
    })

    test('puts a missing outfit and state right after the slot', () => {
        expect(
            fillTemplate('1girl, aria, <<slot>>, red eyes', {
                slot: 'smile',
                outfit: 'pajamas',
                state: 'wet',
            }),
        ).toBe('1girl, aria, smile, pajamas, wet, red eyes')
        expect(
            fillTemplate('1girl, <<state>>, <<slot>>', {
                slot: 'smile',
                outfit: 'pajamas',
                state: 'wet',
            }),
        ).toBe('1girl, wet, smile, pajamas')
    })

    test('drops placeholders that have nothing to fill', () => {
        expect(
            fillTemplate('1girl, <<slot>>, <<outfit>>, <<state>>', {
                slot: '',
                outfit: '',
                state: '',
            }),
        ).toBe('1girl')
    })

    test('wraps with a fixed prompt through its slot or in front', () => {
        expect(wrapFixed('best quality, <<slot>>, no text', 'bedroom')).toBe(
            'best quality, bedroom, no text',
        )
        expect(wrapFixed('best quality', 'bedroom')).toBe('best quality, bedroom')
        expect(wrapFixed('  ', 'bedroom, bedroom')).toBe('bedroom')
    })
})

describe('prompt composition', () => {
    test('builds the scene, negatives and per-character captions', () => {
        const composed = composePrompt({
            fixedPositive: '<<slot>>, no text',
            fixedNegative: 'lowres',
            style: {
                sceneTemplate: 'artist:foo, <<slot>>, very aesthetic, masterpiece',
                negative: 'bad anatomy, lowres',
                params: {},
            },
            scene: '2girls, indoors, bedroom, night',
            characters: [
                {
                    actor: {
                        promptTemplate: '1girl, aria, silver hair, <<slot>>, <<outfit>>, <<state>>',
                        negative: 'short hair',
                    },
                    tags: 'smile, sitting',
                    outfit: { prompt: 'white pajamas', negative: 'hat' },
                    state: 'wet hair',
                },
                {
                    actor: { promptTemplate: '1girl, bell', negative: '' },
                    tags: 'looking at another',
                    outfit: null,
                    state: '',
                },
            ],
        })

        expect(composed).toEqual({
            positive:
                'artist:foo, 2girls, indoors, bedroom, night, very aesthetic, masterpiece, no text',
            negative: 'lowres, bad anatomy',
            characters: [
                {
                    prompt: '1girl, aria, silver hair, smile, sitting, white pajamas, wet hair',
                    negative: 'short hair, hat',
                },
                { prompt: '1girl, bell, looking at another', negative: '' },
            ],
        })
    })

    test('uses the scene tags alone without a style', () => {
        const composed = composePrompt({
            fixedPositive: '',
            fixedNegative: '',
            style: null,
            scene: 'outdoors',
            characters: [],
        })
        expect(composed).toEqual({ positive: 'outdoors', negative: '', characters: [] })
    })
})

describe('image parameters', () => {
    test('style values override defaults and a chosen size overrides both', () => {
        const params = resolveImageParams(
            DEFAULT_NOVELAI_IMAGE_PARAMS,
            { steps: 23, width: 1024, height: 1024, sampler: undefined },
            { width: 1216, height: 832 },
        )
        expect(params).toEqual({
            ...DEFAULT_NOVELAI_IMAGE_PARAMS,
            steps: 23,
            width: 1216,
            height: 832,
        })
        expect(resolveImageParams(DEFAULT_NOVELAI_IMAGE_PARAMS, { width: 1024 }).width).toBe(1024)
    })
})

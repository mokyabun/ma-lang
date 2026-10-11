import { describe, expect, test } from 'bun:test'

import type { CompiledMessage } from '@malang/shared'

import {
    actorRefs,
    AnalysisFailedError,
    type AnalysisInput,
    normalizeAnalysis,
    parseAnalysisOutput,
    runAnalysis,
} from '@/modules/illustrations/analysis'
import {
    insertTokens,
    plainText,
    removeTokens,
    splitParagraphs,
} from '@/modules/illustrations/slots'

const first = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'

const input: AnalysisInput = {
    roster: [
        {
            ref: 'aria',
            name: 'Aria',
            keys: ['aria'],
            outfits: ['uniform'],
            defaultOutfit: 'uniform',
            isUser: false,
        },
        {
            ref: 'mina',
            name: 'Mina',
            keys: ['mina'],
            outfits: [],
            defaultOutfit: null,
            isUser: true,
        },
    ],
    continuity: { present: [], outfits: {}, locked: [], states: {} },
    stateDefinitions: [],
    context: [],
    slots: [
        { slot: 1, text: 'one' },
        { slot: 2, text: 'two' },
        { slot: 3, text: 'three' },
    ],
    count: { min: 1, max: 2 },
    sizes: ['portrait', 'landscape'],
    sceneDirection: '',
}

describe('paragraph slots', () => {
    test('splits on blank lines and skips token-only blocks', () => {
        const content = `First line\nstill first.\n\n  \n{{illustration::${first}}}\n\nSecond.\n\n\nThird.  `
        expect(
            splitParagraphs(content).map((paragraph) => [paragraph.index, paragraph.text]),
        ).toEqual([
            [1, 'First line\nstill first.'],
            [2, 'Second.'],
            [3, 'Third.'],
        ])
    })

    test('inserts tokens after paragraphs and removes them again', () => {
        const content = 'One.\n\nTwo.\n\nThree.'
        const inserted = insertTokens(content, [
            { paragraph: 1, id: first },
            { paragraph: 3, id: second },
        ])
        expect(inserted).toBe(
            `One.\n\n{{illustration::${first}}}\n\nTwo.\n\nThree.\n\n{{illustration::${second}}}`,
        )
        // Existing tokens do not shift the paragraph numbers.
        expect(splitParagraphs(inserted).map((paragraph) => paragraph.text)).toEqual([
            'One.',
            'Two.',
            'Three.',
        ])
        expect(removeTokens(inserted, new Set([first, second]))).toBe(content)
        expect(removeTokens(inserted, new Set([second]))).toBe(
            `One.\n\n{{illustration::${first}}}\n\nTwo.\n\nThree.`,
        )
        expect(() => insertTokens(content, [{ paragraph: 4, id: first }])).toThrow()
    })

    test('reduces message text to plain prose for the model', () => {
        expect(
            plainText(
                `<div class="x">Hi</div>\n\n{{illustration::${first}}}\n\n<style>p{}</style>there`,
                100,
            ),
        ).toBe('Hi\n\nthere')
        expect(plainText('abcdef', 3)).toBe('abc…')
    })
})

describe('analysis output', () => {
    test('accepts JSON wrapped in a code fence after thoughts', () => {
        const parsed = parseAnalysisOutput(
            '<think>hmm {not json}</think>```json\n{"illustrations":[{"slot":"2","scene":"1girl"}]}\n```',
        )
        expect(parsed).toEqual({
            ok: true,
            value: {
                illustrations: [{ slot: 2, size: undefined, scene: '1girl', characters: [] }],
                continuity: {},
            },
        })
    })

    test('reports what is wrong', () => {
        expect(parseAnalysisOutput('no json here')).toMatchObject({ ok: false })
        const missing = parseAnalysisOutput('{"illustrations":[{"scene":"x"}]}')
        expect(missing.ok).toBe(false)
        if (!missing.ok) expect(missing.error).toContain('illustrations.0.slot')
    })

    test('drops unknown slots, actors, sizes and anything beyond the maximum', () => {
        const plan = normalizeAnalysis(
            {
                illustrations: [
                    { slot: 3, size: 'landscape', scene: 'night', characters: [] },
                    {
                        slot: 1,
                        size: 'huge',
                        scene: 'garden',
                        characters: [
                            { actor: 'aria', tags: 'smile' },
                            { actor: 'stranger', tags: 'wave' },
                            { actor: 'aria', tags: 'again' },
                        ],
                    },
                    { slot: 1, size: null, scene: 'duplicate', characters: [] },
                    { slot: 9, size: null, scene: 'missing', characters: [] },
                    { slot: 2, size: null, scene: 'over the limit', characters: [] },
                ],
                continuity: {},
            },
            input,
        )
        expect(plan.illustrations.map((item) => [item.slot, item.size, item.characters])).toEqual([
            [1, null, [{ ref: 'aria', tags: 'smile' }]],
            [2, null, []],
        ])
        expect(plan.warnings).toEqual([
            'Ignored unknown actor "stranger"',
            'Ignored unknown size "huge"',
            'Dropped a second illustration for slot 1',
            'Dropped illustrations beyond the maximum of 2',
        ])
    })

    test('repairs an unusable answer once, then gives up', async () => {
        const seen: CompiledMessage[][] = []
        const replies = ['not json', '{"illustrations":[{"slot":2,"scene":"rain"}]}']
        const plan = await runAnalysis(
            async (messages) => {
                seen.push(messages)
                return replies.shift()!
            },
            'Direct the illustrations.',
            input,
        )
        expect(plan.illustrations.map((item) => item.scene)).toEqual(['rain'])
        expect(seen[1]!.at(-2)).toEqual({ role: 'assistant', content: 'not json' })
        expect(seen[1]!.at(-1)!.content).toContain('could not be used')
        expect(seen[0]![0]!.content).toStartWith('Direct the illustrations.')
        expect(JSON.parse(seen[0]![1]!.content).latest.slots).toHaveLength(3)

        const failure = await runAnalysis(async () => 'still not json', 'x', input).catch(
            (error: unknown) => error,
        )
        expect(failure).toBeInstanceOf(AnalysisFailedError)
    })
})

describe('actor refs', () => {
    test('are readable and unique', () => {
        expect(actorRefs(['Aria Vale', 'aria vale', '아리아', '!!'])).toEqual([
            'aria_vale',
            'aria_vale_2',
            '아리아',
            'actor',
        ])
    })
})

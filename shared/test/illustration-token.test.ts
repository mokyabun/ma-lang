import { describe, expect, test } from 'bun:test'

import { illustrationToken, illustrationTokenIds, stripIllustrationTokens } from '../src'

const first = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'

describe('illustration tokens', () => {
    test('lists token ids in order', () => {
        const text = `a\n\n${illustrationToken(first)}\n\nb ${illustrationToken(second)}`
        expect(illustrationTokenIds(text)).toEqual([first, second])
    })

    test('removes a token block without leaving extra blank lines', () => {
        expect(stripIllustrationTokens(`one\n\n${illustrationToken(first)}\n\ntwo`)).toBe(
            'one\n\ntwo',
        )
        expect(stripIllustrationTokens(`one\n\n${illustrationToken(first)}`)).toBe('one')
        expect(stripIllustrationTokens(`${illustrationToken(first)}\n\none`)).toBe('one')
    })

    test('keeps a single space for an inline token', () => {
        expect(stripIllustrationTokens(`left ${illustrationToken(first)} right`)).toBe('left right')
        expect(stripIllustrationTokens(`left${illustrationToken(first)}right`)).toBe('leftright')
    })

    test('ignores lookalike CBS', () => {
        const text = '{{illustration}} {{inlay::abc}} {{illustration::has space}}'
        expect(stripIllustrationTokens(text)).toBe(text)
    })
})

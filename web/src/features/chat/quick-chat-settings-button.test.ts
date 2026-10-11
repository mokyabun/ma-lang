import { describe, expect, test } from 'bun:test'

import { normalizePosition } from './quick-chat-settings-button'

describe('quick chat settings position', () => {
    test('keeps valid relative coordinates', () => {
        expect(normalizePosition({ x: 0.25, y: 0.75 })).toEqual({ x: 0.25, y: 0.75 })
    })

    test('clamps coordinates so restored buttons remain on screen', () => {
        expect(normalizePosition({ x: -2, y: 4 })).toEqual({ x: 0, y: 1 })
    })

    test('uses a safe default for invalid stored values', () => {
        expect(normalizePosition({ x: 'right', y: null })).toEqual({ x: 0.96, y: 0.82 })
    })
})

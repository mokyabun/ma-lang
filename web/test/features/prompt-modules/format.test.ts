import { describe, expect, test } from 'bun:test'

import { formatAssetBytes } from '@/features/prompt-modules/format'

describe('module asset sizes', () => {
    test('use B, KB and MB with one decimal', () => {
        expect(formatAssetBytes(512)).toBe('512 B')
        expect(formatAssetBytes(2_048)).toBe('2.0 KB')
        expect(formatAssetBytes(5 * 1024 * 1024 + 512 * 1024)).toBe('5.5 MB')
    })
})

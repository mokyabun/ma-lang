import { describe, expect, test } from 'bun:test'

import { formatBytes, initials } from '@/lib/text'

describe('text helpers', () => {
    test('initials use the first two characters, upper-cased', () => {
        expect(initials('  aria ')).toBe('AR')
        expect(initials('아리아')).toBe('아리')
        expect(initials('   ')).toBe('?')
    })

    test('formats bytes in binary units', () => {
        expect(formatBytes(1_023)).toBe('1023 B')
        expect(formatBytes(1_536)).toBe('1.5 KiB')
        expect(formatBytes(1_048_576)).toBe('1.0 MiB')
    })
})

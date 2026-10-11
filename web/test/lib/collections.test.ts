import { describe, expect, test } from 'bun:test'

import { nextVariableKey, removeAt, replaceAt, splitLines, splitList } from '@/lib/collections'

describe('collection helpers', () => {
    test('replace and remove an item without mutating the input', () => {
        const values = ['a', 'b', 'c']
        expect(replaceAt(values, 1, 'B')).toEqual(['a', 'B', 'c'])
        expect(removeAt(values, 0)).toEqual(['b', 'c'])
        expect(values).toEqual(['a', 'b', 'c'])
    })

    test('split comma lists and lines, dropping blanks', () => {
        expect(splitList(' aria, 아리아 ,, ')).toEqual(['aria', '아리아'])
        expect(splitLines('first\r\n\n  second  \n')).toEqual(['first', 'second'])
    })

    test('names a new variable after the first free index', () => {
        expect(nextVariableKey({})).toBe('variable_1')
        expect(nextVariableKey({ mood: '', variable_2: '' })).toBe('variable_3')
        expect(nextVariableKey({ variable_2: '', variable_3: '' })).toBe('variable_4')
    })
})

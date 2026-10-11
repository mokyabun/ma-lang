import { describe, expect, test } from 'bun:test'

import type { LoreEntryInput } from '@malang/shared'
import { makeLoreEntry, testId } from '@test/helpers/fixtures'

import {
    blankLoreEntry,
    joinList,
    loreEntrySummary,
    normalizeLoreEntry,
    positionSelectValue,
    splitList,
} from '@/features/lorebook/model'

describe('lorebook entries', () => {
    test('start blank at the given insertion order with fresh ids', () => {
        const entry = blankLoreEntry(7)
        expect(entry).toMatchObject({ insertionOrder: 7, name: '새 로어', enabled: true })
        expect(blankLoreEntry().id).not.toBe(entry.id)
    })

    test('fill the defaults an imported entry may omit', () => {
        const input: LoreEntryInput = {
            id: testId(600),
            keys: ['library'],
            secondaryKeys: [],
            content: '',
            enabled: true,
            constant: false,
            selective: false,
            caseSensitive: false,
            useRegex: false,
            insertionOrder: 0,
            priority: 0,
            name: '',
        }
        expect(normalizeLoreEntry(input)).toMatchObject({
            keys: ['library'],
            position: '',
            depth: 0,
            role: 'system',
            recursive: 'global',
            probability: 100,
            additionalKeys: [],
            excludeKeys: [],
            decorators: {},
            isGroup: false,
        })
    })

    test('keep the values an entry sets', () => {
        const entry = normalizeLoreEntry(
            makeLoreEntry({ position: 'depth', depth: 4, role: 'user', probability: 30 }),
        )
        expect(entry).toMatchObject({ position: 'depth', depth: 4, role: 'user', probability: 30 })
    })

    test('show known positions as themselves and pt_ positions as custom', () => {
        expect(positionSelectValue(makeLoreEntry({ position: 'after_desc' }))).toBe('after_desc')
        expect(positionSelectValue(makeLoreEntry({ position: 'pt_jailbreak' }))).toBe('__custom__')
        expect(positionSelectValue(makeLoreEntry({ position: 'unknown' }))).toBe('')
    })

    test('round-trip comma lists and summarize by name, then first key', () => {
        expect(splitList(' a, b ,, c ')).toEqual(['a', 'b', 'c'])
        expect(joinList(['a', 'b'])).toBe('a, b')
        expect(loreEntrySummary(makeLoreEntry({ name: 'Library', keys: ['book'] }))).toBe('Library')
        expect(loreEntrySummary(makeLoreEntry({ name: '', keys: ['book'] }))).toBe('book')
        expect(loreEntrySummary(makeLoreEntry({ name: '', keys: [] }))).toBe('제목 없음')
    })
})

import { describe, expect, test } from 'bun:test'

import type { LoreEntry } from '@malang/shared'

import { selectLoreEntries } from '@/services/prompt/lorebook'

const baseEntry: LoreEntry = {
    id: '00000000-0000-4000-8000-000000000001',
    keys: [],
    secondaryKeys: [],
    content: '',
    enabled: true,
    constant: true,
    selective: false,
    caseSensitive: false,
    useRegex: false,
    insertionOrder: 0,
    priority: 0,
    name: '',
    position: '',
    depth: 0,
    role: 'system',
    recursive: 'global',
    probability: 100,
    additionalKeys: [],
    excludeKeys: [],
    decorators: {},
    isGroup: false,
}

describe('Risu lore decorators', () => {
    test('injects lore into another active entry and hides the injector', () => {
        const entries: LoreEntry[] = [
            { ...baseEntry, name: 'profile', content: 'The [mood] profile.' },
            {
                ...baseEntry,
                id: '00000000-0000-4000-8000-000000000002',
                name: 'mood patch',
                content: '@@inject_lore profile\n@@inject_replace [mood]\nbright',
                insertionOrder: 1,
            },
        ]

        const selected = selectLoreEntries(entries, [], { tokenBudget: 100 })

        expect(selected.entries).toHaveLength(1)
        expect(selected.entries[0]?.name).toBe('profile')
        expect(selected.entries[0]?.content).toBe('The bright profile.')
        expect(selected.warnings).toEqual([])
    })
})

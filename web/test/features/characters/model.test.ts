import { describe, expect, test } from 'bun:test'

import { makeCharacter, makeLoreEntry } from '@test/helpers/fixtures'

import { blankCharacterRegex, draftFrom, replaceRegex } from '@/features/characters/model'

describe('character drafts', () => {
    test('copy the editable fields and detach the nested values the editor mutates', () => {
        const character = makeCharacter({
            name: 'Aria',
            lorebook: [makeLoreEntry({ name: 'Library' })],
            defaultVariables: { mood: 'calm' },
            bias: [['hello', 5]],
            luaScript: {
                code: 'print(1)',
                enabled: true,
                lowLevelAccess: false,
                revision: 3,
                codeSha256: 'a'.repeat(64),
            },
        })
        const draft = draftFrom(character)

        expect(draft).toMatchObject({ name: 'Aria', lorebook: character.lorebook })
        expect(draft.luaScript).toEqual({ code: 'print(1)', enabled: true, lowLevelAccess: false })
        expect(draft).not.toHaveProperty('id')
        expect(draft).not.toHaveProperty('avatarAssetId')

        draft.defaultVariables!.mood = 'angry'
        draft.bias![0]![1] = -5
        expect(character.defaultVariables).toEqual({ mood: 'calm' })
        expect(character.bias).toEqual([['hello', 5]])
    })

    test('default to an empty lorebook and no Lua script', () => {
        const draft = draftFrom(makeCharacter({ lorebook: undefined, luaScript: null }))
        expect(draft.lorebook).toEqual([])
        expect(draft.luaScript).toBeNull()
    })

    test('create display regex scripts and replace one without mutating the list', () => {
        const first = blankCharacterRegex()
        const second = blankCharacterRegex()
        expect(first).toMatchObject({ phase: 'editdisplay', flags: 'g', enabled: true })
        expect(first.id).not.toBe(second.id)

        const scripts = [first, second]
        const edited = { ...second, pattern: 'x' }
        expect(replaceRegex(scripts, 1, edited)).toEqual([first, edited])
        expect(scripts[1]).toBe(second)
    })
})

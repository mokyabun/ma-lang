import { describe, expect, test } from 'bun:test'

import { POCKET_RISU_PROFILE_OPTION } from '@malang/shared'

import {
    finiteNumber,
    profileGenerationDefaults,
    runtimeProviderOptions,
    uniqueModels,
} from './model'

describe('model preset input helpers', () => {
    test('removes imported profile metadata from runtime options without mutating it', () => {
        const options = { [POCKET_RISU_PROFILE_OPTION]: { source: true }, custom: 'retained' }
        expect(runtimeProviderOptions(options)).toEqual({ custom: 'retained' })
        expect(options[POCKET_RISU_PROFILE_OPTION]).toEqual({ source: true })
    })

    test('only forwards valid generation parameters', () => {
        expect(
            profileGenerationDefaults({
                temperature: 0.5,
                maxOutputTokens: 512,
                topP: Infinity,
                custom: 5,
                stopSequences: ['END'],
            }),
        ).toEqual({ temperature: 0.5, maxOutputTokens: 512, stopSequences: ['END'] })
        expect(profileGenerationDefaults({ stopSequences: ['END', 1] })).toEqual({})
    })

    test('keeps optional numeric fields empty instead of sending zero', () => {
        expect(finiteNumber('')).toBeUndefined()
        expect(finiteNumber(' ')).toBeUndefined()
        expect(finiteNumber('invalid')).toBeUndefined()
        expect(finiteNumber('Infinity')).toBeUndefined()
        expect(finiteNumber('0')).toBe(0)
    })

    test('deduplicates discovered models by ID', () => {
        expect(
            uniqueModels([
                { id: 'a', name: 'Old' },
                { id: '', name: 'Empty' },
                { id: 'a', name: 'New' },
            ]),
        ).toEqual([{ id: 'a', name: 'New' }])
    })
})

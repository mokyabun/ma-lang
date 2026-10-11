import { describe, expect, test } from 'bun:test'

import { createStore } from 'jotai'

import { autoSaveReportsAtom, autoSaveStatusAtom } from '@/lib/auto-save-state'

describe('auto-save status', () => {
    test('is empty without reports', () => {
        expect(createStore().get(autoSaveStatusAtom)).toBeNull()
    })

    test('shows the most urgent report, then the most recent one', () => {
        const store = createStore()
        store.set(autoSaveReportsAtom, {
            saved: { state: 'saved', error: '', updatedAt: 30 },
            saving: { state: 'saving', error: '', updatedAt: 10 },
            pending: { state: 'pending', error: '', updatedAt: 20 },
        })
        expect(store.get(autoSaveStatusAtom)?.state).toBe('saving')

        store.set(autoSaveReportsAtom, (current) => ({
            ...current,
            failed: { state: 'error', error: '저장 실패', updatedAt: 1 },
        }))
        expect(store.get(autoSaveStatusAtom)).toEqual({
            state: 'error',
            error: '저장 실패',
            updatedAt: 1,
        })

        store.set(autoSaveReportsAtom, {
            older: { state: 'saved', error: '', updatedAt: 1 },
            newer: { state: 'saved', error: '', updatedAt: 2 },
        })
        expect(store.get(autoSaveStatusAtom)?.updatedAt).toBe(2)
    })
})

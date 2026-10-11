import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test'

import { hookHarness } from '@test/helpers/react'
import { getDefaultStore } from 'jotai'
import { act, useState } from 'react'

import { useDebouncedSave } from '@/hooks/use-debounced-save'
import { autoSaveReportsAtom } from '@/lib/auto-save-state'

type Draft = { name: string }
type Saver = ReturnType<typeof useDebouncedSave<Draft>>

let current: Saver
let setValue: (value: Draft) => void
let setEnabled: (enabled: boolean) => void

const harness = hookHarness((value: Saver) => {
    current = value
})

beforeEach(() => {
    jest.useFakeTimers()
})
afterEach(() => {
    jest.useRealTimers()
})

async function mount(save: (value: Draft) => Promise<void>, enabled = true) {
    await harness.mount(() => {
        const [value, updateValue] = useState<Draft>({ name: 'Aria' })
        const [isEnabled, updateEnabled] = useState(enabled)
        setValue = updateValue
        setEnabled = updateEnabled
        return useDebouncedSave(value, save, { delay: 700, enabled: isEnabled })
    })
}

async function edit(name: string) {
    await act(async () => setValue({ name }))
}

async function advance(ms: number) {
    await act(async () => {
        jest.advanceTimersByTime(ms)
    })
    await act(async () => {})
}

function deferredSave() {
    const pending: Array<() => void> = []
    const save = mock(
        (_value: Draft) => new Promise<void>((resolve) => pending.push(() => resolve())),
    )
    return {
        save,
        finish: async (index: number) => {
            await act(async () => pending[index]!())
        },
    }
}

describe('debounced auto-save', () => {
    test('saves only the latest edit once the delay passes', async () => {
        const save = mock(async (_value: Draft) => {})
        await mount(save)
        await advance(1_000)
        expect(save).not.toHaveBeenCalled()
        expect(current.state).toBe('idle')

        await edit('Mina')
        await advance(300)
        await edit('Mina Park')
        expect(current.state).toBe('pending')
        await advance(699)
        expect(save).not.toHaveBeenCalled()

        await advance(1)
        expect(save.mock.calls).toEqual([[{ name: 'Mina Park' }]])
        expect(current.state).toBe('saved')
    })

    test('stays pending when the value changes during a save, then saves it', async () => {
        const { save, finish } = deferredSave()
        await mount(save)
        await edit('Mina')
        await advance(700)
        expect(current.state).toBe('saving')

        await edit('Mina Park')
        await finish(0)
        expect(current.state).toBe('pending')

        await advance(700)
        expect(save.mock.calls.map(([value]) => value.name)).toEqual(['Mina', 'Mina Park'])
        await finish(1)
        expect(current.state).toBe('saved')
    })

    test('reports a failed save in its state and in the shared auto-save reports', async () => {
        // Only the first save fails: the unmount save after the test must not reject unhandled.
        await mount(mock(async (_value: Draft) => {}).mockRejectedValueOnce(new Error('offline')))
        await edit('Mina')
        await advance(700)

        expect(current.state).toBe('error')
        expect(current.error).toBe('offline')
        const reports = Object.values(getDefaultStore().get(autoSaveReportsAtom))
        expect(reports).toContainEqual(
            expect.objectContaining({ state: 'error', error: 'offline' }),
        )
    })

    test('holds edits while disabled and saves them once enabled', async () => {
        const save = mock(async (_value: Draft) => {})
        await mount(save, false)
        await edit('Mina')
        await advance(700)
        await act(async () => current.flush())
        expect(save).not.toHaveBeenCalled()
        expect(current.state).toBe('pending')

        await act(async () => setEnabled(true))
        await advance(700)
        expect(save.mock.calls).toEqual([[{ name: 'Mina' }]])
    })

    test('flush and saveNow save at once and skip unchanged values', async () => {
        const save = mock(async (_value: Draft) => {})
        await mount(save)

        await act(async () => current.saveNow({ name: 'Aria' }))
        expect(save).not.toHaveBeenCalled()
        await act(async () => current.saveNow({ name: 'Mina' }))
        expect(save.mock.calls).toEqual([[{ name: 'Mina' }]])

        await edit('Mina Park')
        await act(async () => current.flush())
        expect(save.mock.calls.at(-1)).toEqual([{ name: 'Mina Park' }])
        await advance(700)
        expect(save).toHaveBeenCalledTimes(2)
    })

    test('reset adopts a value as saved and ignores the save still in flight', async () => {
        const { save, finish } = deferredSave()
        await mount(save)
        await edit('Mina')
        await advance(700)

        await act(async () => current.reset({ name: 'Loaded' }))
        await finish(0)
        expect(current.state).toBe('idle')
        await act(async () => current.saveNow({ name: 'Loaded' }))
        expect(save).toHaveBeenCalledTimes(1)
    })

    test('saves an unsaved edit when it unmounts', async () => {
        const save = mock(async (_value: Draft) => {})
        await mount(save)
        await edit('Mina')
        await harness.unmount()
        expect(save.mock.calls).toEqual([[{ name: 'Mina' }]])
    })
})

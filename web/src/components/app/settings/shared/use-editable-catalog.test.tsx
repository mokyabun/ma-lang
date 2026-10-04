import { describe, expect, test } from 'bun:test'

import { act } from 'react'

import { hookHarness } from '../../../../../test/react'
import { useEditableCatalog } from './use-editable-catalog'

type Item = { id: string; name: string }
type Draft = { name: string }
let catalog: ReturnType<typeof useEditableCatalog<Item, Draft>>

const harness = hookHarness((value: typeof catalog) => {
    catalog = value
})

async function mount(initialId: string | null = null) {
    let remote: Item[] = [
        { id: 'a', name: 'First' },
        { id: 'b', name: 'Second' },
    ]
    const writes: Array<{ id: string; draft: Draft }> = []
    const selected: Array<string | null> = []
    const published: Item[][] = []
    const removed: string[] = []
    const options = {
        items: structuredClone(remote),
        initialId,
        toDraft: (item: Item) => ({ name: item.name }),
        load: async () => structuredClone(remote),
        create: async () => {
            const item = { id: 'created', name: 'Created' }
            remote = [item, ...remote]
            return item
        },
        update: async (id: string, draft: Draft) => {
            writes.push({ id, draft: { ...draft } })
            const item = { id, ...draft }
            remote = remote.map((entry) => (entry.id === id ? item : entry))
            return item
        },
        remove: async (id: string) => {
            removed.push(id)
            remote = remote.filter((item) => item.id !== id)
        },
        importFile: async (file: File) => {
            if (file.name === 'invalid.json') throw new Error('Invalid file')
            const item = { id: 'imported', name: file.name }
            remote = [item, ...remote]
            return item
        },
        onChanged: (items: Item[]) => {
            published.push(items)
        },
        onSelect: async (id: string | null) => {
            selected.push(id)
        },
        createdMessage: 'Created successfully',
    }
    await harness.mount(() => useEditableCatalog(options))
    return { writes, selected, published, removed }
}

describe('editable settings catalog', () => {
    test('starts with the active preset without writing unchanged data', async () => {
        const state = await mount('b')
        expect(catalog.selectedId).toBe('b')
        expect(catalog.draft).toEqual({ name: 'Second' })
        await act(async () => {
            await catalog.autoSave.flush()
        })
        expect(state.writes).toEqual([])
        expect(state.selected).toEqual([])
    })

    test('falls back to the first item when the active preset is unavailable', async () => {
        await mount('missing')
        expect(catalog.selectedId).toBe('a')
    })

    test('flushes the old draft before switching and resets the new baseline', async () => {
        const state = await mount()
        await act(async () => catalog.setDraft({ name: 'Edited' }))
        await act(async () => {
            await catalog.select('b')
        })
        await act(async () => {
            await catalog.autoSave.flush()
        })
        expect(state.writes).toEqual([{ id: 'a', draft: { name: 'Edited' } }])
        expect(state.selected).toEqual(['b'])
        expect(catalog.draft).toEqual({ name: 'Second' })
        expect(catalog.items[0]?.name).toBe('Edited')
    })

    test('creates, publishes and activates a new item', async () => {
        const state = await mount()
        await act(async () => {
            await catalog.create()
        })
        expect(catalog.selectedId).toBe('created')
        expect(catalog.draft).toEqual({ name: 'Created' })
        expect(state.published.at(-1)?.[0]?.id).toBe('created')
        expect(state.selected).toEqual(['created'])
        expect(catalog.message).toBe('Created successfully')
    })

    test('imports an item and reloads the catalog', async () => {
        const state = await mount()
        await act(async () => {
            await catalog.importFile(new File(['{}'], 'module.json'))
        })
        expect(catalog.selectedId).toBe('imported')
        expect(catalog.items).toHaveLength(3)
        expect(state.published.at(-1)?.[0]?.name).toBe('module.json')
        expect(state.selected).toEqual(['imported'])
    })

    test('keeps the current draft and reports import failures', async () => {
        const state = await mount()
        await act(async () => {
            await catalog.importFile(new File(['bad'], 'invalid.json'))
        })
        expect(catalog.selectedId).toBe('a')
        expect(catalog.draft).toEqual({ name: 'First' })
        expect(catalog.message).toBe('Invalid file')
        expect(catalog.saving).toBe(false)
        expect(state.published).toEqual([])
    })

    test('deletes dirty items without saving the deleted draft again', async () => {
        const state = await mount()
        await act(async () => catalog.setDraft({ name: 'Edited before delete' }))
        await act(async () => {
            await catalog.remove()
        })
        await act(async () => {
            await catalog.autoSave.flush()
        })
        expect(state.removed).toEqual(['a'])
        expect(state.writes).toEqual([{ id: 'a', draft: { name: 'Edited before delete' } }])
        expect(catalog.selectedId).toBe('b')
        expect(catalog.draft).toEqual({ name: 'Second' })
        await act(async () => {
            await catalog.remove()
        })
        await act(async () => {
            await catalog.autoSave.flush()
        })
        expect(catalog.items).toEqual([])
        expect(catalog.selectedId).toBe('')
        expect(catalog.draft).toBeNull()
        expect(state.selected).toEqual(['b', null])
        expect(state.writes).toHaveLength(1)
    })

    test('accepts server-side regex changes as the saved baseline', async () => {
        const state = await mount()
        await act(async () => catalog.replaceSaved({ id: 'a', name: 'Regex imported' }))
        await act(async () => {
            await catalog.autoSave.flush()
        })
        expect(catalog.draft).toEqual({ name: 'Regex imported' })
        expect(state.published.at(-1)?.[0]?.name).toBe('Regex imported')
        expect(state.writes).toEqual([])
    })
})

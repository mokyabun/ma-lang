import { useRef, useState } from 'react'

import { useDebouncedSave } from './use-debounced-save'

interface EditableCatalogOptions<Item extends { id: string }, Draft> {
    items: Item[]
    initialId?: string | null
    toDraft: (item: Item) => Draft
    load: () => Promise<Item[]>
    create: () => Promise<Item>
    update: (id: string, draft: Draft) => Promise<Item>
    remove: (id: string) => Promise<unknown>
    importFile: (file: File) => Promise<Item>
    onChanged: (items: Item[]) => void
    onSelect?: (id: string | null) => void | Promise<void>
    createdMessage: string
    selectedMessage?: string
}

export function useEditableCatalog<Item extends { id: string }, Draft>(
    options: EditableCatalogOptions<Item, Draft>,
) {
    const initial = options.items.find((item) => item.id === options.initialId) ?? options.items[0]
    const [items, setItems] = useState(options.items)
    const [selectedId, setSelectedId] = useState(initial?.id ?? '')
    const [draft, setDraft] = useState<Draft | null>(() =>
        initial ? options.toDraft(initial) : null,
    )
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const itemsRef = useRef(items)

    function publish(next: Item[]) {
        itemsRef.current = next
        setItems(next)
        options.onChanged(next)
    }

    function publishItem(saved: Item) {
        const current = itemsRef.current
        publish(
            current.some((item) => item.id === saved.id)
                ? current.map((item) => (item.id === saved.id ? saved : item))
                : [saved, ...current],
        )
    }

    const autoSave = useDebouncedSave(
        draft,
        async (next) => {
            if (next === null || !selectedId) return
            publishItem(await options.update(selectedId, next))
        },
        { enabled: draft !== null && Boolean(selectedId) },
    )

    function choose(item: Item | undefined) {
        const next = item ? options.toDraft(item) : null
        setSelectedId(item?.id ?? '')
        setDraft(next)
        autoSave.reset(next)
    }

    async function run(action: () => Promise<void>, fallback: string) {
        await autoSave.flush()
        setSaving(true)
        setMessage('')
        try {
            await action()
        } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : fallback)
        } finally {
            setSaving(false)
        }
    }

    async function select(id: string) {
        if (!id) return
        await run(async () => {
            const item = itemsRef.current.find((entry) => entry.id === id)
            if (!item) return
            await options.onSelect?.(id)
            choose(item)
            setMessage(options.selectedMessage ?? '')
        }, '편집할 항목을 변경하지 못했습니다.')
    }

    async function create() {
        await run(async () => {
            const saved = await options.create()
            publishItem(saved)
            await options.onSelect?.(saved.id)
            choose(saved)
            setMessage(options.createdMessage)
        }, '새 항목을 만들지 못했습니다.')
    }

    async function importFile(file: File) {
        await run(async () => {
            const saved = await options.importFile(file)
            await options.onSelect?.(saved.id)
            choose(saved)
            publish(await options.load())
            setMessage(`${file.name}을 가져왔습니다.`)
        }, '가져오지 못했습니다.')
    }

    async function remove() {
        if (!selectedId) return
        await run(async () => {
            await options.remove(selectedId)
            // A deleted draft must not be flushed again on blur or unmount.
            choose(undefined)
            const next = await options.load()
            publish(next)
            await options.onSelect?.(next[0]?.id ?? null)
            choose(next[0])
            setMessage('삭제했습니다.')
        }, '삭제하지 못했습니다.')
    }

    function replaceSaved(saved: Item) {
        publishItem(saved)
        choose(saved)
    }

    return {
        items,
        selectedId,
        selected: items.find((item) => item.id === selectedId) ?? null,
        draft,
        setDraft,
        saving,
        message,
        setMessage,
        autoSave,
        select,
        create,
        importFile,
        remove,
        run,
        replaceSaved,
    }
}

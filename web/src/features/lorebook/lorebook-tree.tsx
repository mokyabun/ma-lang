import {
    DndContext,
    type DragEndEvent,
    PointerSensor,
    closestCenter,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LoreEntry } from '@malang/shared'
import {
    BookOpen,
    CaretRight,
    DotsSixVertical,
    Folder,
    FolderPlus,
    Trash,
} from '@phosphor-icons/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { blankLoreEntry } from './model'

const ROOT = 'root'

function containerIdOf(entry: LoreEntry): string {
    if (entry.isGroup) return ROOT
    return entry.group ? `folder:${entry.group}` : ROOT
}

function sortByOrder(list: LoreEntry[]): LoreEntry[] {
    return [...list].sort((a, b) => a.insertionOrder - b.insertionOrder)
}

function insertAt<T>(list: T[], item: T, index: number): T[] {
    const clamped = Math.max(0, Math.min(index, list.length))
    return [...list.slice(0, clamped), item, ...list.slice(clamped)]
}

function moveEntry(
    entries: LoreEntry[],
    activeId: string,
    targetContainerId: string,
    overEntryId: string | null,
): LoreEntry[] {
    const active = entries.find((entry) => entry.id === activeId)
    if (!active) return entries
    if (active.isGroup && targetContainerId !== ROOT) return entries

    let finalTargetContainerId = targetContainerId
    let finalOverEntryId = overEntryId
    const overEntry = overEntryId ? entries.find((entry) => entry.id === overEntryId) : undefined
    if (overEntry?.isGroup && !active.isGroup && overEntry.id !== active.id) {
        finalTargetContainerId = `folder:${overEntry.group}`
        finalOverEntryId = null
    }
    if (active.isGroup && finalTargetContainerId !== ROOT) return entries

    const updatedActive: LoreEntry = {
        ...active,
        group:
            finalTargetContainerId === ROOT
                ? active.isGroup
                    ? active.group
                    : undefined
                : finalTargetContainerId.slice('folder:'.length),
    }

    const siblingsOf = (containerId: string) =>
        entries.filter((entry) => entry.id !== activeId && containerIdOf(entry) === containerId)

    const targetSiblings = sortByOrder(siblingsOf(finalTargetContainerId))
    const insertIndex = finalOverEntryId
        ? Math.max(
              0,
              targetSiblings.findIndex((entry) => entry.id === finalOverEntryId),
          )
        : targetSiblings.length
    const nextTargetSiblings = insertAt(targetSiblings, updatedActive, insertIndex)

    const rootSequence =
        finalTargetContainerId === ROOT ? nextTargetSiblings : sortByOrder(siblingsOf(ROOT))

    const flattened: LoreEntry[] = []
    for (const item of rootSequence) {
        flattened.push(item)
        if (!item.isGroup || !item.group) continue
        const folderContainerId = `folder:${item.group}`
        flattened.push(
            ...(finalTargetContainerId === folderContainerId
                ? nextTargetSiblings
                : sortByOrder(siblingsOf(folderContainerId))),
        )
    }

    return flattened.map((entry, index) => ({ ...entry, insertionOrder: index }))
}

export function addLorebookFolder(entries: LoreEntry[]): LoreEntry[] {
    const folder = blankLoreEntry(entries.length)
    folder.isGroup = true
    folder.group = crypto.randomUUID()
    folder.name = '새 폴더'
    folder.keys = []
    return [...entries, folder]
}

export interface LorebookTreeProps {
    entries: LoreEntry[]
    selectedId: string | null
    onSelect: (id: string) => void
    onChange: (entries: LoreEntry[]) => void
    onDelete: (id: string) => void
    compact?: boolean
}

export function LorebookTree({
    entries,
    selectedId,
    onSelect,
    onChange,
    onDelete,
    compact,
}: LorebookTreeProps) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

    const rootItems = sortByOrder(entries.filter((entry) => containerIdOf(entry) === ROOT))

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over) return
        const activeId = String(active.id)
        const overId = String(over.id)
        if (activeId === overId) return

        let targetContainerId: string
        let overEntryId: string | null
        if (overId.startsWith('container:')) {
            targetContainerId = overId.slice('container:'.length)
            overEntryId = null
        } else {
            const overData = over.data.current as { containerId?: string } | undefined
            targetContainerId = overData?.containerId ?? ROOT
            overEntryId = overId
        }
        onChange(moveEntry(entries, activeId, targetContainerId, overEntryId))
    }

    return (
        <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2 px-1">
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
                    {entries.filter((entry) => !entry.isGroup).length} ENTRIES
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    size={compact ? 'sm' : 'default'}
                    className="gap-1.5 px-2 text-xs"
                    onClick={() => onChange(addLorebookFolder(entries))}
                >
                    <FolderPlus aria-hidden="true" /> 새 폴더
                </Button>
            </div>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                    <SortableContext
                        items={rootItems.map((entry) => entry.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {rootItems.map((entry) =>
                            entry.isGroup ? (
                                <FolderGroup
                                    key={entry.id}
                                    folder={entry}
                                    childEntries={sortByOrder(
                                        entries.filter(
                                            (child) =>
                                                !child.isGroup && child.group === entry.group,
                                        ),
                                    )}
                                    selectedId={selectedId}
                                    onSelect={onSelect}
                                    onDelete={onDelete}
                                    compact={compact}
                                />
                            ) : (
                                <EntryRow
                                    key={entry.id}
                                    entry={entry}
                                    containerId={ROOT}
                                    selected={entry.id === selectedId}
                                    onSelect={onSelect}
                                    onDelete={onDelete}
                                    compact={compact}
                                />
                            ),
                        )}
                    </SortableContext>
                    <ContainerDropZone containerId={ROOT} />
                </div>
            </DndContext>
        </div>
    )
}

function FolderGroup({
    folder,
    childEntries,
    selectedId,
    onSelect,
    onDelete,
    compact,
}: {
    folder: LoreEntry
    childEntries: LoreEntry[]
    selectedId: string | null
    onSelect: (id: string) => void
    onDelete: (id: string) => void
    compact?: boolean
}) {
    const containerId = `folder:${folder.group}`
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: folder.id,
        data: { containerId: ROOT },
    })
    const [expanded, setExpanded] = useState(true)

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn('rounded-md', isDragging && 'opacity-50')}
        >
            <div
                className={cn(
                    'flex min-h-9 items-center gap-1.5 rounded-md px-1.5 font-medium',
                    folder.id === selectedId ? 'bg-selection text-foreground' : '',
                    compact ? 'text-xs' : 'text-sm',
                )}
            >
                <button
                    type="button"
                    className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                    aria-label="폴더 드래그"
                    {...attributes}
                    {...listeners}
                >
                    <DotsSixVertical aria-hidden="true" />
                </button>
                <button
                    type="button"
                    aria-label={expanded ? '폴더 접기' : '폴더 펼치기'}
                    onClick={() => setExpanded(!expanded)}
                    className="text-muted-foreground"
                >
                    <CaretRight
                        aria-hidden="true"
                        className={cn('transition-transform', expanded && 'rotate-90')}
                    />
                </button>
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
                    onClick={() => onSelect(folder.id)}
                >
                    <Folder aria-hidden="true" />
                    <span className="truncate">{folder.name || '이름 없는 폴더'}</span>
                    <small className="font-mono text-[9px] text-muted-foreground">
                        {childEntries.length}
                    </small>
                </button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-destructive"
                    aria-label="폴더 삭제"
                    onClick={() => onDelete(folder.id)}
                >
                    <Trash aria-hidden="true" />
                </Button>
            </div>
            {expanded ? (
                <div className="ml-5 flex flex-col gap-0.5 border-l border-border pl-2">
                    <SortableContext
                        items={childEntries.map((entry) => entry.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {childEntries.map((entry) => (
                            <EntryRow
                                key={entry.id}
                                entry={entry}
                                containerId={containerId}
                                selected={entry.id === selectedId}
                                onSelect={onSelect}
                                onDelete={onDelete}
                                compact={compact}
                            />
                        ))}
                    </SortableContext>
                    <ContainerDropZone containerId={containerId} />
                </div>
            ) : null}
        </div>
    )
}

function EntryRow({
    entry,
    containerId,
    selected,
    onSelect,
    onDelete,
    compact,
}: {
    entry: LoreEntry
    containerId: string
    selected: boolean
    onSelect: (id: string) => void
    onDelete: (id: string) => void
    compact?: boolean
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: entry.id,
        data: { containerId },
    })

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn(
                'flex min-h-9 items-center gap-1.5 rounded-md px-1.5',
                selected ? 'bg-selection text-foreground' : '',
                isDragging && 'opacity-50',
                compact ? 'text-xs' : 'text-sm',
            )}
        >
            <button
                type="button"
                className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                aria-label="항목 드래그"
                {...attributes}
                {...listeners}
            >
                <DotsSixVertical aria-hidden="true" />
            </button>
            <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
                onClick={() => onSelect(entry.id)}
            >
                <BookOpen aria-hidden="true" className="shrink-0 text-muted-foreground" />
                <span className="truncate">{entry.name || entry.keys[0] || '제목 없음'}</span>
                <small className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">
                    {entry.enabled ? 'ACTIVE' : 'OFF'}
                </small>
            </button>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-destructive"
                aria-label="항목 삭제"
                onClick={() => onDelete(entry.id)}
            >
                <Trash aria-hidden="true" />
            </Button>
        </div>
    )
}

function ContainerDropZone({ containerId }: { containerId: string }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `container:${containerId}`,
        data: { containerId },
    })
    return (
        <div
            ref={setNodeRef}
            className={cn('h-3 rounded-md', isOver && 'bg-accent/60')}
            aria-hidden="true"
        />
    )
}

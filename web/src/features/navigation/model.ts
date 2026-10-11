import { type CollisionDetection, closestCenter, pointerWithin } from '@dnd-kit/core'

export interface CollectionGroupLike {
    id: string
    sortOrder: number
}

export interface GroupedItemLike {
    id: string
    groupId: string | null
    sortOrder: number
}

export type CollectionNodeType = 'group' | 'item'
export type CollectionNode = { type: CollectionNodeType; id: string; sortOrder: number }
export type CollectionDropTarget =
    | { type: 'slot'; groupId: string | null; index: number }
    | { type: 'group'; groupId: string }

export const ROOT_COLLECTION = 'root'

/**
 * Drop slots do not overlap collection rows, so pointer hits are deterministic.
 * closestCenter remains useful for keyboard dragging and fast pointer movement.
 */
export const groupCollisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args)
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args)
}

export function groupNodeId(id: string) {
    return `group:${id}`
}

export function itemNodeId(id: string) {
    return `item:${id}`
}

export function dropSlotId(groupId: string | null, index: number) {
    return `drop-slot:${groupId ?? ROOT_COLLECTION}:${index}`
}

export function groupTargetId(groupId: string) {
    return `drop-group:${groupId}`
}

export function nodeTypeFromId(value: string): CollectionNodeType | null {
    if (value.startsWith('group:')) return 'group'
    if (value.startsWith('item:')) return 'item'
    return null
}

export function isCollectionDropTarget(value: unknown): value is CollectionDropTarget {
    if (!value || typeof value !== 'object') return false
    const target = value as Partial<CollectionDropTarget>
    if (target.type === 'group') return typeof target.groupId === 'string'
    return (
        target.type === 'slot' &&
        (target.groupId === null || typeof target.groupId === 'string') &&
        typeof target.index === 'number' &&
        Number.isInteger(target.index) &&
        target.index >= 0
    )
}

export function rootCollectionNodes<G extends CollectionGroupLike, I extends GroupedItemLike>(
    groups: G[],
    items: I[],
): CollectionNode[] {
    return [
        ...groups.map((group) => ({
            type: 'group' as const,
            id: group.id,
            sortOrder: group.sortOrder,
        })),
        ...items
            .filter((item) => item.groupId === null)
            .map((item) => ({ type: 'item' as const, id: item.id, sortOrder: item.sortOrder })),
    ].sort(compareNode)
}

export function groupedChildren<I extends GroupedItemLike>(items: I[], groupId: string): I[] {
    return items
        .filter((item) => item.groupId === groupId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

/**
 * Moves a node to an explicit insertion slot or appends an item to a group.
 * Slot indices describe the collection before the active node is removed; the
 * same-container adjustment below is what keeps downward moves in order.
 */
export function moveGroupedCollection<G extends CollectionGroupLike, I extends GroupedItemLike>(
    groups: G[],
    items: I[],
    activeNodeId: string,
    target: CollectionDropTarget,
): { groups: G[]; items: I[] } {
    const active = parseNodeId(activeNodeId)
    if (!active) return { groups, items }

    const groupMap = new Map(groups.map((group) => [group.id, { ...group }]))
    const itemMap = new Map(items.map((item) => [item.id, { ...item }]))

    if (active.type === 'group') {
        if (target.type !== 'slot' || target.groupId !== null) return { groups, items }
        const activeGroup = groupMap.get(active.id)
        if (!activeGroup) return { groups, items }

        const root = rootCollectionNodes([...groupMap.values()], [...itemMap.values()])
        const sourceIndex = root.findIndex((node) => node.type === 'group' && node.id === active.id)
        if (sourceIndex < 0) return { groups, items }
        root.splice(sourceIndex, 1)
        const insertionIndex = adjustedInsertionIndex(target.index, sourceIndex, root.length)
        root.splice(insertionIndex, 0, {
            type: 'group',
            id: active.id,
            sortOrder: activeGroup.sortOrder,
        })
        applyRootOrder(root, groupMap, itemMap)
        return normalizeCollection(groupMap, itemMap)
    }

    const activeItem = itemMap.get(active.id)
    if (!activeItem) return { groups, items }

    const sourceGroupId = activeItem.groupId
    const targetGroupId = target.groupId
    if (targetGroupId !== null && !groupMap.has(targetGroupId)) return { groups, items }

    if (targetGroupId === null) {
        const root = rootCollectionNodes([...groupMap.values()], [...itemMap.values()])
        const sourceIndex =
            sourceGroupId === null
                ? root.findIndex((node) => node.type === 'item' && node.id === active.id)
                : -1
        if (sourceIndex >= 0) root.splice(sourceIndex, 1)
        activeItem.groupId = null
        const requestedIndex = target.type === 'slot' ? target.index : root.length
        const insertionIndex = adjustedInsertionIndex(requestedIndex, sourceIndex, root.length)
        root.splice(insertionIndex, 0, {
            type: 'item',
            id: active.id,
            sortOrder: activeItem.sortOrder,
        })
        applyRootOrder(root, groupMap, itemMap)
    } else {
        const children = groupedChildren([...itemMap.values()], targetGroupId)
        const sourceIndex =
            sourceGroupId === targetGroupId
                ? children.findIndex((item) => item.id === active.id)
                : -1
        if (sourceIndex >= 0) children.splice(sourceIndex, 1)
        activeItem.groupId = targetGroupId
        const requestedIndex = target.type === 'slot' ? target.index : children.length
        const insertionIndex = adjustedInsertionIndex(requestedIndex, sourceIndex, children.length)
        children.splice(insertionIndex, 0, activeItem)
        children.forEach((item, index) => {
            itemMap.set(item.id, { ...item, groupId: targetGroupId, sortOrder: index })
        })
    }

    return normalizeCollection(groupMap, itemMap)
}

function adjustedInsertionIndex(requested: number, sourceIndex: number, length: number) {
    const afterRemoval = sourceIndex >= 0 && sourceIndex < requested ? requested - 1 : requested
    return Math.max(0, Math.min(afterRemoval, length))
}

function normalizeCollection<G extends CollectionGroupLike, I extends GroupedItemLike>(
    groupMap: Map<string, G>,
    itemMap: Map<string, I>,
) {
    const root = rootCollectionNodes([...groupMap.values()], [...itemMap.values()])
    applyRootOrder(root, groupMap, itemMap)
    for (const group of groupMap.values()) {
        groupedChildren([...itemMap.values()], group.id).forEach((item, index) => {
            itemMap.set(item.id, { ...item, sortOrder: index })
        })
    }
    return { groups: [...groupMap.values()], items: [...itemMap.values()] }
}

function applyRootOrder<G extends CollectionGroupLike, I extends GroupedItemLike>(
    nodes: CollectionNode[],
    groupMap: Map<string, G>,
    itemMap: Map<string, I>,
) {
    nodes.forEach((node, index) => {
        if (node.type === 'group') {
            const group = groupMap.get(node.id)
            if (group) groupMap.set(node.id, { ...group, sortOrder: index })
            return
        }
        const item = itemMap.get(node.id)
        if (item) itemMap.set(node.id, { ...item, groupId: null, sortOrder: index })
    })
}

function parseNodeId(value?: string): { type: CollectionNodeType; id: string } | null {
    if (!value) return null
    if (value.startsWith('group:')) return { type: 'group', id: value.slice(6) }
    if (value.startsWith('item:')) return { type: 'item', id: value.slice(5) }
    return null
}

function compareNode(a: CollectionNode, b: CollectionNode) {
    return a.sortOrder - b.sortOrder || a.type.localeCompare(b.type) || a.id.localeCompare(b.id)
}

import { describe, expect, test } from 'bun:test'

import { groupNodeId, itemNodeId, moveGroupedCollection, rootCollectionNodes } from './model'

describe('grouped collection ordering', () => {
    const groups = [
        { id: 'group-a', sortOrder: 1 },
        { id: 'group-b', sortOrder: 3 },
    ]
    const items = [
        { id: 'root-a', groupId: null, sortOrder: 0 },
        { id: 'root-b', groupId: null, sortOrder: 2 },
        { id: 'child-a', groupId: 'group-a', sortOrder: 0 },
        { id: 'child-b', groupId: 'group-a', sortOrder: 1 },
    ]

    test('appends a root item to a group target', () => {
        const moved = moveGroupedCollection(groups, items, itemNodeId('root-b'), {
            type: 'group',
            groupId: 'group-a',
        })
        expect(moved.items.find((item) => item.id === 'root-b')).toMatchObject({
            groupId: 'group-a',
            sortOrder: 2,
        })
    })

    test('moves a child to an exact root slot and normalizes shared root order', () => {
        const moved = moveGroupedCollection(groups, items, itemNodeId('child-a'), {
            type: 'slot',
            groupId: null,
            index: 2,
        })
        expect(moved.items.find((item) => item.id === 'child-a')?.groupId).toBeNull()
        expect(rootCollectionNodes(moved.groups, moved.items).map((node) => node.id)).toEqual([
            'root-a',
            'group-a',
            'child-a',
            'root-b',
            'group-b',
        ])
    })

    test('moves a root item downward without an off-by-one error', () => {
        const moved = moveGroupedCollection(groups, items, itemNodeId('root-a'), {
            type: 'slot',
            groupId: null,
            index: 4,
        })
        expect(rootCollectionNodes(moved.groups, moved.items).map((node) => node.id)).toEqual([
            'group-a',
            'root-b',
            'group-b',
            'root-a',
        ])
    })

    test('reorders a child downward without changing its group', () => {
        const moved = moveGroupedCollection(groups, items, itemNodeId('child-a'), {
            type: 'slot',
            groupId: 'group-a',
            index: 2,
        })
        expect(
            moved.items
                .filter((item) => item.groupId === 'group-a')
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((item) => item.id),
        ).toEqual(['child-b', 'child-a'])
    })

    test('reorders root groups alongside ungrouped items', () => {
        const moved = moveGroupedCollection(groups, items, groupNodeId('group-b'), {
            type: 'slot',
            groupId: null,
            index: 0,
        })
        expect(rootCollectionNodes(moved.groups, moved.items).map((node) => node.id)).toEqual([
            'group-b',
            'root-a',
            'group-a',
            'root-b',
        ])
    })

    test('does not allow a group to be nested in another group', () => {
        const moved = moveGroupedCollection(groups, items, groupNodeId('group-b'), {
            type: 'group',
            groupId: 'group-a',
        })
        expect(moved).toEqual({ groups, items })
    })
})

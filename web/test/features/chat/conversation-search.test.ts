import { describe, expect, test } from 'bun:test'

import { makeConversation, testId } from '@test/helpers/fixtures'
import { createStore } from 'jotai'

import {
    conversationSearchAtom,
    filteredConversationsAtom,
} from '@/features/chat/conversation-search'
import { conversationsAtom, selectedCharacterIdAtom } from '@/lib/store'

describe('conversation search', () => {
    test('lists the selected character’s open conversations matching the title', () => {
        const store = createStore()
        store.set(conversationsAtom, [
            makeConversation({ id: testId(101), title: 'Library Night' }),
            makeConversation({ id: testId(102), title: 'Market' }),
            makeConversation({
                id: testId(103),
                title: 'Library archive',
                archivedAt: '2026-01-02T00:00:00.000Z',
            }),
            makeConversation({ id: testId(104), title: 'Library', characterId: testId(11) }),
        ])
        const ids = () => store.get(filteredConversationsAtom).map((item) => item.id)

        expect(ids()).toEqual([])
        store.set(selectedCharacterIdAtom, testId(10))
        expect(ids()).toEqual([testId(101), testId(102)])
        store.set(conversationSearchAtom, '  library ')
        expect(ids()).toEqual([testId(101)])
    })
})

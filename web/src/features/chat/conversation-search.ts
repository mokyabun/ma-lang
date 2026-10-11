import { atom } from 'jotai'

import { conversationsAtom, selectedCharacterIdAtom } from '@/lib/store'

export const conversationSearchAtom = atom('')

export const filteredConversationsAtom = atom((get) => {
    const selectedCharacterId = get(selectedCharacterIdAtom)
    const normalizedSearch = get(conversationSearchAtom).trim().toLocaleLowerCase()

    return get(conversationsAtom).filter(
        (conversation) =>
            !conversation.archivedAt &&
            conversation.characterId === selectedCharacterId &&
            (!normalizedSearch ||
                conversation.title.toLocaleLowerCase().includes(normalizedSearch)),
    )
})

import { useNavigate } from '@tanstack/react-router'
import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback } from 'react'

import { settingsAtom } from '@/lib/store'

import { createConversationAtom } from './atom'

export function useStartConversation() {
    const navigate = useNavigate()
    const settings = useAtomValue(settingsAtom)
    const createConversation = useSetAtom(createConversationAtom)

    return useCallback(
        async (characterId?: string) => {
            const conversation = await createConversation({
                characterId,
                promptPresetId: settings?.defaultPromptPresetId ?? undefined,
                greetingIndex: -1,
            })
            if (!conversation) return null
            await navigate({
                to: '/characters/$characterId/chats/$conversationId',
                params: {
                    characterId: conversation.characterId,
                    conversationId: conversation.id,
                },
            })
            return conversation
        },
        [createConversation, navigate, settings?.defaultPromptPresetId],
    )
}

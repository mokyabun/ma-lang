import { useNavigate } from '@tanstack/react-router'
import { useAtomValue, useSetAtom } from 'jotai'

import { selectedCharacterIdAtom } from '@/lib/store'

import { confirmationAtom } from '../dialogs/atom'
import { deleteConversationAtom } from './atom'

export function useConversationDelete() {
    const navigate = useNavigate()
    const characterId = useAtomValue(selectedCharacterIdAtom)
    const deleteConversation = useSetAtom(deleteConversationAtom)
    const setConfirmation = useSetAtom(confirmationAtom)

    return (conversationId: string) => {
        setConfirmation({
            title: '이 대화를 삭제할까요?',
            description: '메시지와 생성 기록이 모두 영구 삭제되며 되돌릴 수 없습니다.',
            confirmLabel: '대화 삭제',
            action: async () => {
                const result = await deleteConversation(conversationId)
                if (!result.ok) return
                if (characterId && result.nextConversation) {
                    await navigate({
                        to: '/characters/$characterId/chats/$conversationId',
                        params: {
                            characterId,
                            conversationId: result.nextConversation.id,
                        },
                    })
                } else if (characterId) {
                    await navigate({
                        to: '/characters/$characterId',
                        params: { characterId },
                    })
                } else {
                    await navigate({ to: '/characters' })
                }
            },
        })
    }
}

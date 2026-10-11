import { GENERAL_CHAT_CHARACTER_ID, type Character } from '@malang/shared'
import { useNavigate } from '@tanstack/react-router'
import { useSetAtom } from 'jotai'

import { confirmationAtom } from '@/components/dialogs/atom'

import { deleteCharacterAtom } from './atom'

export function useCharacterDelete() {
    const navigate = useNavigate()
    const deleteCharacter = useSetAtom(deleteCharacterAtom)
    const setConfirmation = useSetAtom(confirmationAtom)

    return (character: Character) => {
        if (character.id === GENERAL_CHAT_CHARACTER_ID) return
        setConfirmation({
            title: `${character.name}을 삭제할까요?`,
            description: '캐릭터와 연결된 모든 대화가 영구 삭제되며 되돌릴 수 없습니다.',
            confirmLabel: '캐릭터 삭제',
            action: async () => {
                const result = await deleteCharacter(character.id)
                if (!result.ok || !result.wasSelected) return
                if (result.nextCharacter && result.nextConversation) {
                    await navigate({
                        to: '/characters/$characterId/chats/$conversationId',
                        params: {
                            characterId: result.nextCharacter.id,
                            conversationId: result.nextConversation.id,
                        },
                    })
                } else if (result.nextCharacter) {
                    await navigate({
                        to: '/characters/$characterId',
                        params: { characterId: result.nextCharacter.id },
                    })
                } else {
                    await navigate({ to: '/characters' })
                }
            },
        })
    }
}

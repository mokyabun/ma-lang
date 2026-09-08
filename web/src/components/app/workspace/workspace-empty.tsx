import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'
import { CaretRight, ChatsCircle, UploadSimple } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useAtomValue, useSetAtom } from 'jotai'

import { Button } from '@/components/ui/button'

import { activeCharactersAtom, conversationsAtom } from '../atom'
import { requestCharacterImportAtom } from '../character/atom'
import { CharacterAvatar } from '../character/character-avatar'
import { conversationCreatingAtom } from '../chat/atom'
import { useStartConversation } from '../chat/use-start-conversation'

export function WorkspaceEmpty() {
    const navigate = useNavigate()
    const allCharacters = useAtomValue(activeCharactersAtom)
    const conversations = useAtomValue(conversationsAtom)
    const requestImport = useSetAtom(requestCharacterImportAtom)
    const creating = useAtomValue(conversationCreatingAtom)
    const startConversation = useStartConversation()
    const chatCharacter = allCharacters.find(
        (character) => character.id === GENERAL_CHAT_CHARACTER_ID,
    )
    const characters = allCharacters.filter(
        (character) => character.id !== GENERAL_CHAT_CHARACTER_ID,
    )
    const hasCharacters = allCharacters.length > 0

    if (!hasCharacters) {
        return (
            <div className="row-span-full grid h-full place-content-center justify-items-center px-6 text-center [&>h2]:mt-5 [&>h2]:font-serif [&>h2]:text-3xl [&>p]:max-w-lg [&>p]:text-muted-foreground">
                <div
                    className="grid size-20 place-items-center border border-border bg-card font-serif text-3xl text-primary"
                    aria-hidden="true"
                >
                    <UploadSimple />
                </div>
                <h2>첫 캐릭터를 들여오세요.</h2>
                <p>RisuAI의 CCv2·CCv3 JSON, PNG, CHARX 카드를 그대로 가져올 수 있습니다.</p>
                <Button size="lg" onClick={() => requestImport()}>
                    <UploadSimple aria-hidden="true" /> 캐릭터 카드 가져오기
                </Button>
            </div>
        )
    }

    const activeConversations = conversations.filter((conversation) => !conversation.archivedAt)
    const chatConversation = activeConversations.find(
        (conversation) => conversation.characterId === GENERAL_CHAT_CHARACTER_ID,
    )

    async function openCharacter(characterId: string) {
        const existing = activeConversations.find(
            (conversation) => conversation.characterId === characterId,
        )
        if (existing) {
            await navigate({
                to: '/characters/$characterId/chats/$conversationId',
                params: { characterId, conversationId: existing.id },
            })
            return
        }
        await startConversation(characterId)
    }

    return (
        <div className="row-span-full mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 py-10 sm:py-16">
            <div className="mb-8 text-center">
                <h2 className="font-serif text-3xl">누구와 이야기할까요?</h2>
            </div>

            <button
                type="button"
                className="group mb-8 flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                onClick={() => void openCharacter(GENERAL_CHAT_CHARACTER_ID)}
                disabled={!chatCharacter || creating}
            >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <ChatsCircle className="size-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block font-serif text-lg">Chat</span>
                    <span className="block truncate text-sm text-muted-foreground">
                        {chatConversation ? 'General Chat 이어가기' : '무엇이든 편하게 물어보세요.'}
                    </span>
                </span>
                <CaretRight
                    className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                />
            </button>

            <div className="mb-3 flex items-center gap-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                <span>캐릭터</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {characters.map((character) => (
                    <button
                        key={character.id}
                        type="button"
                        className="group flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card p-4 text-center shadow-sm transition-colors hover:border-primary/50 hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
                        onClick={() => void openCharacter(character.id)}
                        disabled={creating}
                    >
                        <CharacterAvatar character={character} className="size-16 rounded-full" />
                        <span className="w-full truncate font-serif text-sm">{character.name}</span>
                    </button>
                ))}
                {!characters.length ? (
                    <button
                        type="button"
                        className="col-span-full flex min-h-28 items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground"
                        onClick={() => requestImport()}
                    >
                        <UploadSimple aria-hidden="true" /> 캐릭터 카드 가져오기
                    </button>
                ) : null}
            </div>
        </div>
    )
}

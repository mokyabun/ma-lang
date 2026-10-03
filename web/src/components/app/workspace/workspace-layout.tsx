import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { type ChangeEvent, type ReactNode, useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

import {
    activeCharactersAtom,
    characterGroupsAtom,
    charactersAtom,
    conversationsAtom,
    selectedCharacterIdAtom,
    workspaceErrorAtom,
} from '../atom'
import {
    characterCreatingAtom,
    characterImportRequestedAtom,
    characterPackageImportRequestedAtom,
    createCharacterAtom,
    importCharacterAtom,
    importCharacterPackageAtom,
} from '../character/atom'
import { useCharacterDelete } from '../character/use-character-delete'
import { generatingConversationIdsAtom } from '../chat/atom'
import { useStartConversation } from '../chat/use-start-conversation'
import { WorkspaceDialogs } from '../dialogs/workspace-dialogs'
import { mobileSidebarOpenAtom } from '../sidebar/atom'
import { CharacterRail } from '../sidebar/workspace-navigation'
import { WorkspaceError } from './workspace-feedback'

export function WorkspaceLayout({ children }: { children: ReactNode }) {
    const navigate = useNavigate()
    const characters = useAtomValue(activeCharactersAtom)
    const groups = useAtomValue(characterGroupsAtom)
    const conversations = useAtomValue(conversationsAtom)
    const selectedCharacterId = useAtomValue(selectedCharacterIdAtom)
    const generatingIds = useAtomValue(generatingConversationIdsAtom)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useAtom(mobileSidebarOpenAtom)
    const characterCreating = useAtomValue(characterCreatingAtom)
    const importCharacter = useSetAtom(importCharacterAtom)
    const importCharacterPackage = useSetAtom(importCharacterPackageAtom)
    const createCharacter = useSetAtom(createCharacterAtom)
    const [importRequested, setImportRequested] = useAtom(characterImportRequestedAtom)
    const [packageImportRequested, setPackageImportRequested] = useAtom(
        characterPackageImportRequestedAtom,
    )
    const fileInputRef = useRef<HTMLInputElement>(null)
    const packageInputRef = useRef<HTMLInputElement>(null)
    const confirmDeleteCharacter = useCharacterDelete()
    const startConversation = useStartConversation()
    const setCharacters = useSetAtom(charactersAtom)
    const setGroups = useSetAtom(characterGroupsAtom)
    const setWorkspaceError = useSetAtom(workspaceErrorAtom)
    const busyCharacterIds = new Set(
        conversations
            .filter((conversation) => generatingIds.has(conversation.id))
            .map((conversation) => conversation.characterId),
    )

    useEffect(() => {
        if (!importRequested) return
        fileInputRef.current?.click()
        setImportRequested(false)
    }, [importRequested, setImportRequested])

    useEffect(() => {
        if (!packageImportRequested) return
        packageInputRef.current?.click()
        setPackageImportRequested(false)
    }, [packageImportRequested, setPackageImportRequested])

    useEffect(() => {
        if (!mobileSidebarOpen) return
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileSidebarOpen(false)
        }
        window.addEventListener('keydown', closeOnEscape)
        return () => window.removeEventListener('keydown', closeOnEscape)
    }, [mobileSidebarOpen, setMobileSidebarOpen])

    async function selectCharacter(characterId: string) {
        const conversation = conversations.find(
            (item) => !item.archivedAt && item.characterId === characterId,
        )
        setMobileSidebarOpen(true)
        if (conversation) {
            await navigate({
                to: '/characters/$characterId/chats/$conversationId',
                params: { characterId, conversationId: conversation.id },
            })
            return
        }
        if (characterId === GENERAL_CHAT_CHARACTER_ID) {
            await startConversation(characterId)
            return
        }
        await navigate({ to: '/characters/$characterId', params: { characterId } })
    }

    async function handleImport(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        const character = await importCharacter(file)
        if (!character) return
        await navigate({
            to: '/characters/$characterId/character/$section',
            params: { characterId: character.id, section: 'profile' },
        })
    }

    async function handleCreateCharacter() {
        const character = await createCharacter()
        if (!character) return
        await navigate({
            to: '/characters/$characterId/character/$section',
            params: { characterId: character.id, section: 'profile' },
        })
    }

    async function handlePackageImport(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        const result = await importCharacterPackage(file)
        if (!result) return
        if (result.conversations[0]) {
            await navigate({
                to: '/characters/$characterId/chats/$conversationId',
                params: {
                    characterId: result.character.id,
                    conversationId: result.conversations[0].id,
                },
            })
            return
        }
        await navigate({
            to: '/characters/$characterId/character/$section',
            params: { characterId: result.character.id, section: 'profile' },
        })
    }

    return (
        <main className="relative grid h-dvh w-full grid-cols-[4.5rem_22rem_minmax(0,1fr)] bg-background max-[820px]:grid-cols-1">
            <Input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".json,.png,.charx,application/json,image/png"
                onChange={handleImport}
            />
            <Input
                ref={packageInputRef}
                className="sr-only"
                type="file"
                accept=".zip,application/zip"
                onChange={handlePackageImport}
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="fixed left-[0.625rem] top-[0.625rem] z-50 hidden size-[2.75rem] rounded-full border border-sidebar-border bg-sidebar/95 text-sidebar-foreground shadow-lg backdrop-blur-md hover:border-primary/50 hover:bg-sidebar max-[820px]:grid max-[820px]:place-items-center"
                onClick={() => setMobileSidebarOpen((open) => !open)}
                aria-label={mobileSidebarOpen ? '전체 사이드바 닫기' : '전체 사이드바 열기'}
                aria-controls="character-rail conversation-sidebar"
                aria-expanded={mobileSidebarOpen}
            >
                {mobileSidebarOpen ? (
                    <ArrowLeft aria-hidden="true" />
                ) : (
                    <ArrowRight aria-hidden="true" />
                )}
            </Button>
            <CharacterRail
                characters={characters}
                groups={groups}
                selectedId={selectedCharacterId}
                busyCharacterIds={busyCharacterIds}
                creating={characterCreating}
                mobileOpen={mobileSidebarOpen}
                onHome={() => void navigate({ to: '/characters' })}
                onSelect={(id) => void selectCharacter(id)}
                onEdit={(characterId) =>
                    void navigate({
                        to: '/characters/$characterId/character/$section',
                        params: { characterId, section: 'profile' },
                    })
                }
                onDelete={confirmDeleteCharacter}
                onImport={() => setImportRequested(true)}
                onImportPackage={() => setPackageImportRequested(true)}
                onCreate={() => void handleCreateCharacter()}
                onCreateGroup={async (name) => {
                    try {
                        const group = await api.createCharacterGroup(name)
                        setGroups((current) => [...current, group])
                    } catch (cause) {
                        setWorkspaceError(
                            cause instanceof Error
                                ? cause.message
                                : '캐릭터 그룹을 만들지 못했습니다.',
                        )
                    }
                }}
                onRenameGroup={async (groupId, name) => {
                    try {
                        const group = await api.updateCharacterGroup(groupId, name)
                        setGroups((current) =>
                            current.map((item) => (item.id === group.id ? group : item)),
                        )
                    } catch (cause) {
                        setWorkspaceError(
                            cause instanceof Error
                                ? cause.message
                                : '캐릭터 그룹 이름을 바꾸지 못했습니다.',
                        )
                    }
                }}
                onDeleteGroup={async (groupId) => {
                    try {
                        await api.deleteCharacterGroup(groupId)
                        setGroups((current) => current.filter((group) => group.id !== groupId))
                        setCharacters((current) =>
                            current.map((character) =>
                                character.groupId === groupId
                                    ? { ...character, groupId: null }
                                    : character,
                            ),
                        )
                    } catch (cause) {
                        setWorkspaceError(
                            cause instanceof Error
                                ? cause.message
                                : '캐릭터 그룹을 삭제하지 못했습니다.',
                        )
                    }
                }}
                onOrganize={async (nextGroups, nextCharacters) => {
                    const previousGroups = groups
                    const previousCharacters = characters
                    setGroups(nextGroups)
                    setCharacters((current) => [
                        ...current.filter(
                            (character) => character.id === GENERAL_CHAT_CHARACTER_ID,
                        ),
                        ...nextCharacters,
                    ])
                    try {
                        const result = await api.organizeCharacters({
                            groups: nextGroups.map(({ id, sortOrder }) => ({ id, sortOrder })),
                            characters: nextCharacters.map(({ id, groupId, sortOrder }) => ({
                                id,
                                groupId,
                                sortOrder,
                            })),
                        })
                        setGroups(result.groups)
                        setCharacters(result.characters)
                    } catch (cause) {
                        setGroups(previousGroups)
                        setCharacters(previousCharacters)
                        setWorkspaceError(
                            cause instanceof Error
                                ? cause.message
                                : '캐릭터 순서를 저장하지 못했습니다.',
                        )
                    }
                }}
                onSettings={() =>
                    void navigate({
                        to: '/settings/$section',
                        params: { section: 'provider' },
                    })
                }
            />
            {children}
            <WorkspaceError />
            <WorkspaceDialogs />
        </main>
    )
}

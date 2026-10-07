import type { CharacterAsset, CharacterUpdate } from '@malang/shared'
import { atom } from 'jotai'

import { api } from '@/lib/api'

import {
    charactersAtom,
    conversationGroupsAtom,
    conversationsAtom,
    selectedCharacterIdAtom,
    selectedConversationIdAtom,
    workspaceErrorAtom,
} from '../atom'
import { loadingAtom } from '../dialogs/atom'
import { withImportProgress } from '../dialogs/import-progress'
import { personaListAtom } from '../settings/persona/atom'
import { mobileSidebarOpenAtom } from '../sidebar/atom'

export const characterAssetsAtom = atom<CharacterAsset[]>([])
export const characterSavingAtom = atom(false)
export const characterCreatingAtom = atom(false)
export const characterImportRequestedAtom = atom(false)
export const characterPackageImportRequestedAtom = atom(false)

export const requestCharacterImportAtom = atom(null, (_get, set) => {
    set(characterImportRequestedAtom, true)
})

export const requestCharacterPackageImportAtom = atom(null, (_get, set) => {
    set(characterPackageImportRequestedAtom, true)
})

export const importCharacterAtom = atom(null, async (_get, set, file: File) => {
    set(workspaceErrorAtom, '')
    try {
        const result = await withImportProgress(
            (loading) => set(loadingAtom, loading),
            file,
            (onProgress) => api.importCharacter(file, onProgress),
        )
        const assetResult = await api.characterAssets(result.character.id)
        set(charactersAtom, (current) => [result.character, ...current])
        set(characterAssetsAtom, assetResult.assets)
        set(selectedCharacterIdAtom, result.character.id)
        set(selectedConversationIdAtom, null)
        set(mobileSidebarOpenAtom, true)
        return result.character
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '캐릭터 카드를 가져오지 못했습니다.',
        )
        return null
    }
})

export const importCharacterPackageAtom = atom(null, async (_get, set, file: File) => {
    set(workspaceErrorAtom, '')
    try {
        const result = await withImportProgress(
            (loading) => set(loadingAtom, loading),
            file,
            (onProgress) => api.importCharacterPackage(file, onProgress),
        )
        const assetResult = await api.characterAssets(result.character.id)
        set(charactersAtom, (current) => [result.character, ...current])
        set(conversationsAtom, (current) => [...result.conversations, ...current])
        set(conversationGroupsAtom, (current) => [...current, ...result.conversationGroups])
        set(personaListAtom, (current) => [...current, ...result.personas])
        set(characterAssetsAtom, assetResult.assets)
        set(selectedCharacterIdAtom, result.character.id)
        set(selectedConversationIdAtom, result.conversations[0]?.id ?? null)
        set(mobileSidebarOpenAtom, true)
        return result
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error
                ? cause.message
                : 'PocketRisu 캐릭터 패키지를 가져오지 못했습니다.',
        )
        return null
    }
})

export const createCharacterAtom = atom(null, async (get, set) => {
    if (get(characterCreatingAtom)) return null
    set(characterCreatingAtom, true)
    set(workspaceErrorAtom, '')
    try {
        const character = await api.createCharacter({
            name: '새 캐릭터',
            description: '',
            personality: '',
            scenario: '',
            firstMessage: '',
            alternateGreetings: [],
            exampleMessage: '',
            systemPrompt: '',
            postHistoryInstructions: '',
            creator: '',
            characterVersion: '',
            tags: [],
            lorebook: [],
            loreSettings: {},
            regexScripts: [],
            moduleReferences: [],
            defaultVariables: {},
            bias: [],
            luaScript: null,
        })
        set(charactersAtom, (current) => [character, ...current])
        set(selectedCharacterIdAtom, character.id)
        set(selectedConversationIdAtom, null)
        set(characterAssetsAtom, [])
        return character
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '캐릭터를 만들지 못했습니다.',
        )
        return null
    } finally {
        set(characterCreatingAtom, false)
    }
})

export const saveCharacterAtom = atom(null, async (get, set, input: CharacterUpdate) => {
    const characterId = get(selectedCharacterIdAtom)
    if (!characterId) return null
    set(characterSavingAtom, true)
    try {
        const character = await api.updateCharacter(characterId, input)
        set(charactersAtom, (current) =>
            current.map((item) => (item.id === character.id ? character : item)),
        )
        return character
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '캐릭터를 저장하지 못했습니다.',
        )
        throw cause
    } finally {
        set(characterSavingAtom, false)
    }
})

export const uploadCharacterAvatarAtom = atom(null, async (get, set, file: File) => {
    const characterId = get(selectedCharacterIdAtom)
    if (!characterId) return null
    try {
        const character = await api.uploadAvatar(characterId, file)
        const assetResult = await api.characterAssets(characterId)
        set(charactersAtom, (current) =>
            current.map((item) => (item.id === character.id ? character : item)),
        )
        set(characterAssetsAtom, assetResult.assets)
        return character
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '대표 이미지를 저장하지 못했습니다.',
        )
        throw cause
    }
})

export const removeCharacterAvatarAtom = atom(null, async (get, set) => {
    const characterId = get(selectedCharacterIdAtom)
    if (!characterId) return null
    try {
        const character = await api.removeAvatar(characterId)
        set(charactersAtom, (current) =>
            current.map((item) => (item.id === character.id ? character : item)),
        )
        return character
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '대표 이미지를 제거하지 못했습니다.',
        )
        throw cause
    }
})

export const archiveCharacterAtom = atom(null, async (_get, set, characterId: string) => {
    try {
        await api.archiveCharacter(characterId)
        const archivedAt = new Date().toISOString()
        set(charactersAtom, (current) =>
            current.map((item) => (item.id === characterId ? { ...item, archivedAt } : item)),
        )
        return true
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '캐릭터를 보관하지 못했습니다.',
        )
        return false
    }
})

export const deleteCharacterAtom = atom(null, async (get, set, characterId: string) => {
    try {
        await api.deleteCharacter(characterId)
        const wasSelected = get(selectedCharacterIdAtom) === characterId
        const characters = get(charactersAtom).filter((item) => item.id !== characterId)
        const conversations = get(conversationsAtom).filter(
            (item) => item.characterId !== characterId,
        )
        const nextCharacter = characters.find((item) => !item.archivedAt) ?? null
        const nextConversation =
            conversations.find(
                (item) => !item.archivedAt && item.characterId === nextCharacter?.id,
            ) ?? null

        set(charactersAtom, characters)
        set(conversationsAtom, conversations)
        if (wasSelected) {
            set(selectedCharacterIdAtom, nextCharacter?.id ?? null)
            set(selectedConversationIdAtom, nextConversation?.id ?? null)
            set(characterAssetsAtom, [])
        }
        return { ok: true as const, wasSelected, nextCharacter, nextConversation }
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '캐릭터를 삭제하지 못했습니다.',
        )
        return {
            ok: false as const,
            wasSelected: false,
            nextCharacter: null,
            nextConversation: null,
        }
    }
})

export const restoreCharacterAtom = atom(null, async (_get, set, characterId: string) => {
    try {
        const character = await api.restoreCharacter(characterId)
        set(charactersAtom, (current) =>
            current.map((item) => (item.id === character.id ? character : item)),
        )
        return character
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '캐릭터를 복원하지 못했습니다.',
        )
        return null
    }
})

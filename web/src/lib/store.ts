import type {
    AppSettings,
    Character,
    CharacterGroup,
    Conversation,
    ConversationGroup,
    ModelApiKey,
    ModelChainPreset,
    ModelPreset,
    PromptModule,
    PromptPreset,
    ProviderSettings,
} from '@malang/shared'
import { atom } from 'jotai'

import { api } from '@/lib/api'

export const charactersAtom = atom<Character[]>([])
export const characterGroupsAtom = atom<CharacterGroup[]>([])
export const conversationsAtom = atom<Conversation[]>([])
export const conversationGroupsAtom = atom<ConversationGroup[]>([])
export const settingsAtom = atom<AppSettings | null>(null)
export const providerAtom = atom<ProviderSettings | null>(null)
export const modelPresetsAtom = atom<ModelPreset[]>([])
export const modelApiKeysAtom = atom<ModelApiKey[]>([])
export const modelChainPresetsAtom = atom<ModelChainPreset[]>([])
export const promptPresetsAtom = atom<PromptPreset[]>([])
export const promptModulesAtom = atom<PromptModule[]>([])

export const selectedCharacterIdAtom = atom<string | null>(null)
export const selectedConversationIdAtom = atom<string | null>(null)
export const workspaceInitializedAtom = atom(false)
export const workspaceLoadingAtom = atom(false)
export const workspaceErrorAtom = atom('')
export const mobileSidebarOpenAtom = atom(false)
/** Invalidates settings reads that started before a prompt-toggle write completed. */
export const promptToggleRevisionAtom = atom(0)

export const updatePromptToggleValuesAtom = atom(
    null,
    async (_get, set, promptToggleValues: Record<string, string>) => {
        try {
            const settings = await api.updateSettings({ promptToggleValues })
            set(promptToggleRevisionAtom, (revision) => revision + 1)
            set(settingsAtom, settings)
            return settings
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '프롬프트 토글을 저장하지 못했습니다.',
            )
            throw cause
        }
    },
)

export const selectedCharacterAtom = atom((get) => {
    const selectedId = get(selectedCharacterIdAtom)
    return get(charactersAtom).find((character) => character.id === selectedId) ?? null
})

export const selectedConversationAtom = atom((get) => {
    const selectedId = get(selectedConversationIdAtom)
    return get(conversationsAtom).find((conversation) => conversation.id === selectedId) ?? null
})

export const activeCharactersAtom = atom((get) =>
    get(charactersAtom).filter((character) => !character.archivedAt),
)

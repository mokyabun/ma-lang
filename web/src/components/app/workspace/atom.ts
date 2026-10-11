import type { CharacterAsset } from '@malang/shared'
import { atom } from 'jotai'

import { api } from '@/lib/api'
import {
    characterGroupsAtom,
    charactersAtom,
    conversationGroupsAtom,
    conversationsAtom,
    modelApiKeysAtom,
    modelChainPresetsAtom,
    modelPresetsAtom,
    promptModulesAtom,
    promptPresetsAtom,
    providerAtom,
    selectedCharacterIdAtom,
    selectedConversationIdAtom,
    settingsAtom,
    workspaceErrorAtom,
    workspaceInitializedAtom,
    workspaceLoadingAtom,
} from '@/lib/store'

import { characterAssetsAtom } from '../character/atom'
import { personaListAtom, selectedPersonaIdAtom } from '../settings/persona/atom'

export const loadWorkspaceAtom = atom(
    null,
    async (
        _get,
        set,
        {
            requestedCharacterId,
            requestedConversationId,
        }: { requestedCharacterId?: string; requestedConversationId?: string },
    ) => {
        if (_get(workspaceLoadingAtom)) return

        const initialized = _get(workspaceInitializedAtom)
        const currentCharacterId = _get(selectedCharacterIdAtom)
        const cachedConversations = _get(conversationsAtom)
        const cachedConversation = requestedConversationId
            ? cachedConversations.find(
                  (conversation) =>
                      !conversation.archivedAt &&
                      conversation.id === requestedConversationId &&
                      conversation.characterId === currentCharacterId,
              )
            : undefined

        // 같은 캐릭터 안에서 대화를 이동할 때는 캐시된 항목을 즉시 선택한다.
        // 전체 workspace 갱신은 뒤에서 계속되므로 화면을 로더로 교체할 필요가 없다.
        if (initialized && requestedCharacterId === currentCharacterId && cachedConversation) {
            set(selectedConversationIdAtom, cachedConversation.id)
        }

        set(workspaceLoadingAtom, true)
        set(workspaceErrorAtom, '')
        try {
            const [
                characterResult,
                conversationResult,
                settings,
                provider,
                presetResult,
                moduleResult,
                personaResult,
                modelCatalog,
                chains,
            ] = await Promise.all([
                api.characters(),
                api.conversations(),
                api.settings(),
                api.provider(),
                api.promptPresets(),
                api.promptModules(),
                api.personas(),
                api.modelCatalog(),
                api.modelChains(),
            ])

            const character =
                characterResult.characters.find(
                    (item) => !item.archivedAt && item.id === requestedCharacterId,
                ) ?? characterResult.characters.find((item) => !item.archivedAt)

            // `api.characters()` returns the lightweight list shape (no lorebook entries).
            // Fetch the full record for the character actually being viewed/edited BEFORE
            // publishing charactersAtom, so components mounting off this bootstrap (the chat
            // sidebar's character tab) never observe a lore-less character — their lorebook
            // state is captured once at mount and would otherwise never resync. Also fetch its
            // preserved (non-avatar) assets for the same reason.
            let characters = characterResult.characters
            let assets: CharacterAsset[] | undefined
            if (character && requestedCharacterId && character.id === requestedCharacterId) {
                try {
                    const [full, assetResult] = await Promise.all([
                        api.character(character.id),
                        api.characterAssets(character.id),
                    ])
                    characters = characters.map((item) => (item.id === full.id ? full : item))
                    assets = assetResult.assets
                } catch {
                    // Keep the lighter list entry if the detail fetch fails.
                }
            }

            set(charactersAtom, characters)
            set(characterGroupsAtom, characterResult.groups)
            if (assets) set(characterAssetsAtom, assets)
            set(conversationsAtom, conversationResult.conversations)
            set(conversationGroupsAtom, conversationResult.groups)
            set(settingsAtom, settings)
            set(providerAtom, provider)
            set(modelPresetsAtom, modelCatalog.presets)
            set(modelApiKeysAtom, modelCatalog.apiKeys)
            set(modelChainPresetsAtom, chains.presets)
            set(promptPresetsAtom, presetResult.promptPresets)
            set(promptModulesAtom, moduleResult.modules)
            set(personaListAtom, personaResult.personas)
            set(selectedPersonaIdAtom, settings.selectedPersonaId)
            set(selectedCharacterIdAtom, character?.id ?? null)

            const conversation =
                conversationResult.conversations.find(
                    (item) => !item.archivedAt && item.id === requestedConversationId,
                ) ??
                conversationResult.conversations.find(
                    (item) => !item.archivedAt && item.characterId === character?.id,
                )
            set(selectedConversationIdAtom, conversation?.id ?? null)
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '작업공간을 불러오지 못했습니다.',
            )
        } finally {
            set(workspaceInitializedAtom, true)
            set(workspaceLoadingAtom, false)
        }
    },
)

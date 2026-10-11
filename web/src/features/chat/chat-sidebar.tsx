import type { GenerationParameters } from '@malang/shared'
import { useNavigate } from '@tanstack/react-router'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'

import { useTheme } from '@/components/theme-provider'
import { ConversationSidebar } from '@/features/navigation/conversation-sidebar'
import { personaListAtom, selectPersonaAtom, selectedPersonaIdAtom } from '@/features/personas/atom'
import { moduleInput } from '@/features/prompt-modules/model'
import { presetInput } from '@/features/prompt-presets/model'
import { api } from '@/lib/api'
import {
    conversationGroupsAtom,
    conversationsAtom,
    mobileSidebarOpenAtom,
    modelPresetsAtom,
    modelChainPresetsAtom,
    promptModulesAtom,
    promptPresetsAtom,
    selectedCharacterAtom,
    selectedConversationAtom,
    selectedConversationIdAtom,
    settingsAtom,
    updatePromptToggleValuesAtom,
    workspaceErrorAtom,
} from '@/lib/store'
import type { WorkspacePage } from '@/lib/workspace-page'

import {
    conversationModuleStatesAtom,
    conversationCreatingAtom,
    generatingConversationIdsAtom,
    loadConversationAtom,
    toggleConversationModuleAtom,
    updateConversationAtom,
} from './atom'
import { ChatSettingsDialog } from './chat-settings-dialog'
import { conversationSearchAtom, filteredConversationsAtom } from './conversation-search'
import { QuickChatSettingsButton } from './quick-chat-settings-button'
import { useConversationDelete } from './use-conversation-delete'
import { useStartConversation } from './use-start-conversation'

export function ChatSidebar({
    page,
}: {
    page: Extract<WorkspacePage, { kind: 'chat' | 'character' }>
}) {
    const navigate = useNavigate()
    const { quickSettingsButton } = useTheme()
    const conversations = useAtomValue(conversationsAtom)
    const conversationGroups = useAtomValue(conversationGroupsAtom)
    const character = useAtomValue(selectedCharacterAtom)
    const conversation = useAtomValue(selectedConversationAtom)
    const conversationId = useAtomValue(selectedConversationIdAtom)
    const presets = useAtomValue(promptPresetsAtom)
    const modelPresets = useAtomValue(modelPresetsAtom)
    const modelChains = useAtomValue(modelChainPresetsAtom)
    const personas = useAtomValue(personaListAtom)
    const selectedPersonaId = useAtomValue(selectedPersonaIdAtom)
    const settings = useAtomValue(settingsAtom)
    const moduleStates = useAtomValue(conversationModuleStatesAtom)
    const filteredConversations = useAtomValue(filteredConversationsAtom)
    const generatingIds = useAtomValue(generatingConversationIdsAtom)
    const conversationCreating = useAtomValue(conversationCreatingAtom)
    const [mobileOpen, setMobileOpen] = useAtom(mobileSidebarOpenAtom)
    const [search, setSearch] = useAtom(conversationSearchAtom)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const updatePromptToggleValues = useSetAtom(updatePromptToggleValuesAtom)
    const selectPersona = useSetAtom(selectPersonaAtom)
    const setSettings = useSetAtom(settingsAtom)
    const setModules = useSetAtom(promptModulesAtom)
    const setPresets = useSetAtom(promptPresetsAtom)
    const setConversations = useSetAtom(conversationsAtom)
    const setConversationGroups = useSetAtom(conversationGroupsAtom)
    const setWorkspaceError = useSetAtom(workspaceErrorAtom)
    const loadConversation = useSetAtom(loadConversationAtom)
    const toggleModule = useSetAtom(toggleConversationModuleAtom)
    const updateConversation = useSetAtom(updateConversationAtom)
    const confirmDeleteConversation = useConversationDelete()
    const startConversation = useStartConversation()

    function editCharacter() {
        if (!character) return
        setMobileOpen(false)
        void navigate({
            to: '/characters/$characterId/character/$section',
            params: { characterId: character.id, section: 'profile' },
        })
    }

    async function updateGeneration(parameters: GenerationParameters) {
        const effectivePromptPresetId = conversation?.promptPresetLocked
            ? conversation.promptPresetId
            : settings?.defaultPromptPresetId
        const preset = presets.find((item) => item.id === effectivePromptPresetId)
        if (!preset) return
        const saved = await api.updatePromptPreset(preset.id, {
            ...presetInput(preset),
            parameters,
        })
        setPresets((current) => current.map((item) => (item.id === saved.id ? saved : item)))
    }

    return (
        <>
            <ConversationSidebar
                character={character}
                conversations={filteredConversations}
                groups={conversationGroups.filter((group) => group.characterId === character?.id)}
                selectedId={conversationId}
                search={search}
                generatingIds={generatingIds}
                creating={conversationCreating}
                mobileOpen={mobileOpen}
                workspace={page.kind}
                onSearch={setSearch}
                onSelect={(id) => {
                    const selected = conversations.find((item) => item.id === id)
                    setMobileOpen(false)
                    if (!selected) return
                    void navigate({
                        to: '/characters/$characterId/chats/$conversationId',
                        params: { characterId: selected.characterId, conversationId: id },
                    })
                }}
                onCreate={() => void startConversation()}
                onRename={async (conversationId, title) => {
                    await updateConversation({ conversationId, input: { title } })
                }}
                onArchive={confirmDeleteConversation}
                onCreateGroup={async (name) => {
                    if (!character) return
                    try {
                        const group = await api.createConversationGroup(character.id, name)
                        setConversationGroups((current) => [...current, group])
                    } catch (cause) {
                        setWorkspaceError(
                            cause instanceof Error
                                ? cause.message
                                : '채팅 그룹을 만들지 못했습니다.',
                        )
                    }
                }}
                onRenameGroup={async (groupId, name) => {
                    try {
                        const group = await api.updateConversationGroup(groupId, name)
                        setConversationGroups((current) =>
                            current.map((item) => (item.id === group.id ? group : item)),
                        )
                    } catch (cause) {
                        setWorkspaceError(
                            cause instanceof Error
                                ? cause.message
                                : '채팅 그룹 이름을 바꾸지 못했습니다.',
                        )
                    }
                }}
                onDeleteGroup={async (groupId) => {
                    try {
                        await api.deleteConversationGroup(groupId)
                        setConversationGroups((current) =>
                            current.filter((group) => group.id !== groupId),
                        )
                        setConversations((current) =>
                            current.map((item) =>
                                item.groupId === groupId ? { ...item, groupId: null } : item,
                            ),
                        )
                    } catch (cause) {
                        setWorkspaceError(
                            cause instanceof Error
                                ? cause.message
                                : '채팅 그룹을 삭제하지 못했습니다.',
                        )
                    }
                }}
                onOrganize={async (nextGroups, nextConversations) => {
                    if (!character) return
                    const previousGroups = conversationGroups
                    const previousConversations = conversations
                    setConversationGroups((current) => [
                        ...current.filter((group) => group.characterId !== character.id),
                        ...nextGroups,
                    ])
                    setConversations((current) => [
                        ...current.filter((item) => item.characterId !== character.id),
                        ...nextConversations,
                    ])
                    try {
                        const result = await api.organizeConversations({
                            characterId: character.id,
                            groups: nextGroups.map(({ id, sortOrder }) => ({ id, sortOrder })),
                            conversations: nextConversations.map(({ id, groupId, sortOrder }) => ({
                                id,
                                groupId,
                                sortOrder,
                            })),
                        })
                        setConversationGroups((current) => [
                            ...current.filter((group) => group.characterId !== character.id),
                            ...result.groups,
                        ])
                        setConversations((current) => [
                            ...current.filter((item) => item.characterId !== character.id),
                            ...result.conversations,
                        ])
                    } catch (cause) {
                        setConversationGroups(previousGroups)
                        setConversations(previousConversations)
                        setWorkspaceError(
                            cause instanceof Error
                                ? cause.message
                                : '채팅 순서를 저장하지 못했습니다.',
                        )
                    }
                }}
                onClose={() => setMobileOpen(false)}
                onEditCharacter={editCharacter}
                onOpenSettings={() => {
                    setMobileOpen(false)
                    setSettingsOpen(true)
                }}
            />
            {quickSettingsButton && page.kind === 'chat' && conversation ? (
                <QuickChatSettingsButton onOpen={() => setSettingsOpen(true)} />
            ) : null}
            <ChatSettingsDialog
                open={settingsOpen}
                conversation={conversation}
                modelPresets={modelPresets}
                modelChains={modelChains}
                defaultModelPresetId={settings?.defaultModelPresetId ?? null}
                defaultAuxiliaryModelPresetId={settings?.defaultAuxiliaryModelPresetId ?? null}
                activePromptPresetId={settings?.defaultPromptPresetId ?? ''}
                selectedPersonaId={selectedPersonaId}
                personas={personas}
                promptToggleValues={settings?.promptToggleValues ?? {}}
                presets={presets}
                moduleStates={moduleStates}
                onOpenChange={setSettingsOpen}
                onGlobalPromptPresetChange={async (defaultPromptPresetId) => {
                    const updated = await api.updateSettings({ defaultPromptPresetId })
                    setSettings(updated)
                    if (conversation) await loadConversation(conversation.id)
                }}
                onGlobalPersonaChange={async (personaId) => {
                    await selectPersona(personaId)
                    if (conversation) await loadConversation(conversation.id)
                }}
                onConversationContextChange={async (input) => {
                    if (!conversation) return
                    await updateConversation({ conversationId: conversation.id, input })
                    await loadConversation(conversation.id)
                }}
                onGlobalModuleToggle={async (moduleId, enabledByDefault) => {
                    const module = moduleStates.find(
                        (state) => state.module.id === moduleId,
                    )?.module
                    if (!module) return
                    try {
                        const saved = await api.updatePromptModule(moduleId, {
                            ...moduleInput(module),
                            enabledByDefault,
                        })
                        setModules((current) =>
                            current.map((item) => (item.id === saved.id ? saved : item)),
                        )
                        if (conversation) await loadConversation(conversation.id)
                    } catch (cause) {
                        setWorkspaceError(
                            cause instanceof Error
                                ? cause.message
                                : 'Global 모듈 설정을 저장하지 못했습니다.',
                        )
                    }
                }}
                onModuleToggle={async (moduleId, enabled) => {
                    if (!conversation) return
                    await toggleModule({
                        conversationId: conversation.id,
                        moduleId,
                        enabled,
                    })
                }}
                onTogglesChange={async (toggles) => {
                    await updatePromptToggleValues(toggles)
                }}
                onGenerationChange={updateGeneration}
                onModelBindingChange={async (input) => {
                    if (!conversation) return
                    await updateConversation({ conversationId: conversation.id, input })
                }}
                onChainBindingChange={async (modelChainPresetId) => {
                    if (!conversation) return
                    await updateConversation({
                        conversationId: conversation.id,
                        input: { modelChainPresetId },
                    })
                }}
                onSaveModelDefaults={async (input) => {
                    const updated = await api.updateSettings(input)
                    setSettings(updated)
                }}
                onOpenProviderSettings={() => {
                    setSettingsOpen(false)
                    void navigate({
                        to: '/settings/$section',
                        params: { section: 'provider' },
                    })
                }}
                onOpenChainSettings={() => {
                    setSettingsOpen(false)
                    void navigate({
                        to: '/settings/$section',
                        params: { section: 'chains' },
                    })
                }}
            />
        </>
    )
}

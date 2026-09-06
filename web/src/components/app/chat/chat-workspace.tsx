import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'
import { useNavigate } from '@tanstack/react-router'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'

import { api, assetUrl } from '@/lib/api'
import { type BackgroundLayer, resolveBackgroundEmbedding } from '@/lib/background-embedding'
import { activePromptToggles } from '@/lib/prompt-toggles'
import { connectRuntimeEvents } from '@/lib/runtime-events'

import {
    promptPresetsAtom,
    modelPresetsAtom,
    selectedCharacterAtom,
    selectedConversationAtom,
    selectedConversationIdAtom,
    settingsAtom,
    updatePromptToggleValuesAtom,
} from '../atom'
import {
    characterAssetsAtom,
    removeCharacterAvatarAtom,
    saveCharacterAtom,
    uploadCharacterAvatarAtom,
} from '../character/atom'
import { CharacterQuickEditor } from '../character/character-quick-editor'
import { useCharacterDelete } from '../character/use-character-delete'
import { personaListAtom } from '../settings/persona/atom'
import type { WorkspacePage } from '../workspace/types'
import { WorkspaceEmpty } from '../workspace/workspace-empty'
import {
    activeGenerationsAtom,
    cancelGenerationAtom,
    conversationModuleStatesAtom,
    generateReplyAtom,
    hasStreamingMessageAtom,
    inspectorOpenAtom,
    loadConversationAtom,
    messageLoadingAtom,
    messagesAtom,
    updateConversationAtom,
} from './atom'
import { ChatHeader } from './chat-header'
import { ChatInspector } from './chat-inspector'
import { ChatSidebar } from './chat-sidebar'
import { Composer, MessageTranscript } from './conversation-view'
import { useConversationDelete } from './use-conversation-delete'

export function ChatWorkspace({
    page,
}: {
    page: Extract<WorkspacePage, { kind: 'chat' | 'character' }>
}) {
    const navigate = useNavigate()
    const character = useAtomValue(selectedCharacterAtom)
    const conversation = useAtomValue(selectedConversationAtom)
    const conversationId = useAtomValue(selectedConversationIdAtom)
    const settings = useAtomValue(settingsAtom)
    const modelPresets = useAtomValue(modelPresetsAtom)
    const presets = useAtomValue(promptPresetsAtom)
    const messages = useAtomValue(messagesAtom)
    const messageLoading = useAtomValue(messageLoadingAtom)
    const activeGenerations = useAtomValue(activeGenerationsAtom)
    const moduleStates = useAtomValue(conversationModuleStatesAtom)
    const characterAssets = useAtomValue(characterAssetsAtom)
    const personas = useAtomValue(personaListAtom)
    const hasStreamingMessage = useAtomValue(hasStreamingMessageAtom)
    const [inspectorOpen, setInspectorOpen] = useAtom(inspectorOpenAtom)
    const loadConversation = useSetAtom(loadConversationAtom)
    const updateConversation = useSetAtom(updateConversationAtom)
    const updatePromptToggleValues = useSetAtom(updatePromptToggleValuesAtom)
    const generateReply = useSetAtom(generateReplyAtom)
    const cancelGeneration = useSetAtom(cancelGenerationAtom)
    const confirmDelete = useConversationDelete()
    const confirmDeleteCharacter = useCharacterDelete()
    const saveCharacter = useSetAtom(saveCharacterAtom)
    const uploadCharacterAvatar = useSetAtom(uploadCharacterAvatarAtom)
    const removeCharacterAvatar = useSetAtom(removeCharacterAvatarAtom)
    const currentGeneration = conversationId ? activeGenerations[conversationId] : undefined
    const busy = Boolean(currentGeneration) || hasStreamingMessage
    const effectivePromptPresetId = conversation?.promptPresetLocked
        ? conversation.promptPresetId
        : settings?.defaultPromptPresetId
    const effectivePersonaId = conversation?.personaLocked
        ? conversation.boundPersonaId
        : settings?.selectedPersonaId
    const activePersona = personas.find((persona) => persona.id === effectivePersonaId) ?? null
    const selectedPreset = presets.find((preset) => preset.id === effectivePromptPresetId)
    const effectiveModel = modelPresets.find(
        (preset) => preset.id === (conversation?.modelPresetId ?? settings?.defaultModelPresetId),
    )
    const toggleVariables = Object.fromEntries(
        activePromptToggles(selectedPreset, moduleStates)
            .filter((toggle) => toggle.key)
            .map((toggle) => [
                `toggle_${toggle.key}`,
                settings?.promptToggleValues[toggle.key] ?? toggle.defaultValue,
            ]),
    )
    const backgroundVariables = {
        ...settings?.globalVariables,
        ...conversation?.variables,
        ...toggleVariables,
    }
    const resolvedBackgrounds = moduleStates
        .filter((state) => state.enabled && state.module.backgroundEmbedding)
        .map((state) =>
            resolveBackgroundEmbedding(
                state.module.backgroundEmbedding,
                state.module.assets,
                backgroundVariables,
                assetUrl,
                '#malang-chat-theme',
            ),
        )
    const backgroundCss = resolvedBackgrounds.map((background) => background.css).join('\n')
    const backgroundLayers = resolvedBackgrounds.flatMap((background) => background.layers)

    useEffect(() => {
        if (!conversationId) return
        queueMicrotask(() => void loadConversation(conversationId))
    }, [conversationId, loadConversation])

    useEffect(() => {
        if (!conversationId || !hasStreamingMessage) return
        const timer = window.setInterval(() => void loadConversation(conversationId), 1_500)
        return () => window.clearInterval(timer)
    }, [conversationId, hasStreamingMessage, loadConversation])

    useEffect(
        () =>
            connectRuntimeEvents(async () => {
                if (conversationId) await loadConversation(conversationId)
            }),
        [conversationId, loadConversation],
    )

    return (
        <>
            <ChatSidebar page={page} />
            {page.kind === 'character' &&
            character &&
            character.id !== GENERAL_CHAT_CHARACTER_ID ? (
                <CharacterQuickEditor
                    key={character.id}
                    character={character}
                    assets={characterAssets}
                    section={page.section}
                    onSectionChange={(section) =>
                        void navigate({
                            to: '/characters/$characterId/character/$section',
                            params: { characterId: character.id, section },
                        })
                    }
                    onSave={async (input) => {
                        await saveCharacter(input)
                    }}
                    onAvatar={async (file) => {
                        await uploadCharacterAvatar(file)
                    }}
                    onRemoveAvatar={async () => {
                        await removeCharacterAvatar()
                    }}
                    onArchive={() => confirmDeleteCharacter(character)}
                />
            ) : (
                <section
                    id="malang-chat-root"
                    className="relative isolate grid min-h-0 min-w-0 grid-rows-[4rem_minmax(0,1fr)_auto] overflow-hidden bg-background [&>:not(style):not([data-malang-background])]:relative [&>:not(style):not([data-malang-background])]:z-10"
                >
                    {backgroundCss ? (
                        <style data-malang-module-background>{backgroundCss}</style>
                    ) : null}
                    <ModuleBackground layers={backgroundLayers} />
                    {character && conversation && page.kind === 'chat' && page.characterId ? (
                        <>
                            <ChatHeader
                                character={character}
                                conversation={conversation}
                                modelPreset={effectiveModel ?? null}
                                busy={busy}
                                onToggleInspector={() => setInspectorOpen((current) => !current)}
                            />
                            <MessageTranscript
                                key={`transcript:${conversation.id}`}
                                character={character}
                                conversationId={conversation.id}
                                imageAssets={[
                                    ...characterAssets,
                                    ...moduleStates
                                        .filter((state) => state.enabled)
                                        .flatMap((state) => state.module.assets),
                                ]}
                                userName={settings?.userName || 'User'}
                                userPersona={activePersona}
                                messages={messages}
                                loading={messageLoading}
                                greetingIndex={conversation.greetingIndex}
                                greetingCount={1 + character.alternateGreetings.length}
                                onRegenerate={() =>
                                    void generateReply({
                                        conversationId: conversation.id,
                                        regenerate: true,
                                    })
                                }
                                onLuaTriggered={() => loadConversation(conversation.id)}
                                onSelectGreeting={async (greetingIndex) => {
                                    const updated = await updateConversation({
                                        conversationId: conversation.id,
                                        input: { greetingIndex },
                                    })
                                    if (updated) await loadConversation(conversation.id)
                                }}
                                onEdit={async (message, content) => {
                                    await api.updateMessage(conversation.id, message.id, content)
                                    await loadConversation(conversation.id)
                                }}
                                onDelete={async (message, scope) => {
                                    if (scope === 'from') {
                                        await api.truncateFromMessage(conversation.id, message.id)
                                    } else {
                                        await api.deleteMessage(conversation.id, message.id)
                                    }
                                    await loadConversation(conversation.id)
                                }}
                                onVersions={(message) =>
                                    api.messageGenerations(conversation.id, message.id)
                                }
                                onSelectVersion={async (message, generationId) => {
                                    await api.selectGeneration(
                                        conversation.id,
                                        message.id,
                                        generationId,
                                    )
                                    await loadConversation(conversation.id)
                                }}
                            />
                            <Composer
                                characterName={character.name}
                                disabled={!effectiveModel || busy}
                                busy={busy}
                                canCancel={Boolean(currentGeneration?.generationId)}
                                canSendEmpty={messages.at(-1)?.role === 'user'}
                                onSend={(content) =>
                                    void generateReply({ conversationId: conversation.id, content })
                                }
                                onCancel={() => void cancelGeneration(conversation.id)}
                                onOpenSettings={() =>
                                    void navigate({
                                        to: '/settings/$section',
                                        params: { section: 'provider' },
                                    })
                                }
                            />
                            <ChatInspector
                                key={conversation.id}
                                open={inspectorOpen}
                                character={character}
                                conversation={conversation}
                                presets={presets}
                                promptPresetId={effectivePromptPresetId ?? ''}
                                promptToggleValues={settings?.promptToggleValues ?? {}}
                                moduleStates={moduleStates}
                                onClose={() => setInspectorOpen(false)}
                                onUpdate={(input) =>
                                    void updateConversation({
                                        conversationId: conversation.id,
                                        input,
                                    })
                                }
                                onPromptToggleValuesChange={async (values) => {
                                    await updatePromptToggleValues(values)
                                }}
                                onPreview={() => api.promptPreview(conversation.id)}
                                onArchive={() => confirmDelete(conversation.id)}
                            />
                        </>
                    ) : (
                        <WorkspaceEmpty />
                    )}
                </section>
            )}
        </>
    )
}

function ModuleBackground({ layers }: { layers: BackgroundLayer[] }) {
    if (!layers.length) return null
    return (
        <div
            data-malang-background
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
            {layers.map((layer, index) => {
                const key = `${layer.kind}-${layer.url}-${index}`
                if (layer.kind === 'background') {
                    return (
                        <div
                            key={key}
                            className="absolute inset-0 bg-cover bg-center"
                            data-asset-name={layer.name}
                            style={{
                                backgroundImage: `linear-gradient(color-mix(in oklab, var(--background) 58%, transparent), color-mix(in oklab, var(--background) 58%, transparent)), url("${layer.url}")`,
                            }}
                        />
                    )
                }
                if (layer.kind === 'video') {
                    return (
                        <video
                            key={key}
                            className="absolute inset-0 size-full object-cover opacity-40"
                            data-asset-name={layer.name}
                            autoPlay
                            muted
                            loop
                            playsInline
                            src={layer.url}
                        />
                    )
                }
                if (layer.kind === 'audio') {
                    return (
                        // Imported background audio can be instrumental and has no caption source.
                        // oxlint-disable-next-line jsx-a11y/media-has-caption
                        <audio
                            key={key}
                            className="pointer-events-auto absolute bottom-4 left-4 max-w-[calc(100%-2rem)] opacity-80"
                            data-asset-name={layer.name}
                            controls
                            loop
                            src={layer.url}
                            aria-label={`${layer.name} 배경 오디오`}
                        />
                    )
                }
                return (
                    <img
                        key={key}
                        className="absolute inset-0 size-full object-contain"
                        data-asset-name={layer.name}
                        src={layer.url}
                        alt=""
                    />
                )
            })}
        </div>
    )
}

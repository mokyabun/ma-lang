import type { Store } from '@/db'
import { loadRisuChat } from '@/services/prompt/pocketrisu/chat'
import {
    collectRegexScripts,
    processScripts,
    RegexSandbox,
} from '@/services/prompt/pocketrisu/scripts'

import { effectivePromptPresetId } from '../conversations'
import { conversationModuleStates } from '../modules'
import type { PersonaService } from '../personas'

export function loadGenerationContext(
    store: Store,
    personas: PersonaService,
    conversationId: string,
) {
    const conversation = store.conversation.get(conversationId)
    if (!conversation) throw new Error('Conversation not found')
    const character = store.character.get(conversation.characterId)
    if (!character) throw new Error('Character not found')
    const settings = store.settings.get()
    const preset = store.promptPreset.get(effectivePromptPresetId(conversation, settings))
    if (!preset) throw new Error('Prompt preset not found')
    const moduleStates = conversationModuleStates(store, conversationId).filter(
        (state) => state.enabled,
    )
    const characterAssets = store.characterAsset.list(character.id).map((link) => ({
        name: link.name,
        type: link.type,
        extension: link.extension,
        url: `/api/v1/assets/${link.assetId}`,
    }))
    const moduleAssets = moduleStates.flatMap((state) =>
        store.promptModuleAsset.list(state.module.id).map((link) => ({
            name: link.name,
            type: link.type,
            extension: link.extension,
            url: `/api/v1/assets/${link.assetId}`,
            moduleNamespace: state.module.namespace,
        })),
    )
    return {
        conversation,
        character,
        preset,
        messages: store.message.list(conversationId),
        settings,
        modelId: store.provider.get()?.modelId,
        persona: personas.effectiveFor(conversation, settings),
        modules: moduleStates.map((state) => state.module),
        assets: [...characterAssets, ...moduleAssets],
        moduleActivationSources: Object.fromEntries(
            moduleStates.map((state) => [state.module.id, state.activationSource]),
        ),
    }
}

export type GenerationContext = ReturnType<typeof loadGenerationContext>

/** processScriptFull for the editinput/editoutput phases against the conversation's live chat. */
export async function processEditScripts(
    context: GenerationContext,
    input: {
        data: string
        mode: 'editinput' | 'editoutput'
        /** The stored message being edited; PocketRisu's chatID, or -1 when absent. */
        messageId?: string
    },
): Promise<string> {
    const warnings: string[] = []
    const { parser, chatMessages } = loadRisuChat({
        character: context.character,
        conversation: context.conversation,
        messages: context.messages,
        preset: context.preset,
        settings: context.settings,
        persona: context.persona,
        modules: context.modules,
        assets: context.assets,
        modelId: context.modelId,
        warnings,
    })
    const chatId = chatMessages.findIndex((message) => message.id === input.messageId)
    const sandbox = new RegexSandbox()
    try {
        return await processScripts({
            scripts: collectRegexScripts(context.preset, context.character, context.modules),
            data: input.data,
            mode: input.mode,
            chatId,
            parse: (text) => parser.parse(text, { chatId }),
            parser,
            sandbox,
            warnings,
        })
    } finally {
        sandbox.close()
    }
}

export function normalizeCompiledRole(role: string): 'system' | 'user' | 'assistant' {
    if (role === 'system' || role === 'sys') return 'system'
    if (role === 'user') return 'user'
    return 'assistant'
}

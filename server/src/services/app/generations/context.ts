import type { Message } from '@malang/shared'

import type { Store } from '@/db'
import { collectRegexScripts, processRegexText } from '@/services/prompt/regex-runtime'
import type { TemplateContext } from '@/services/prompt/template-engine'

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
    const preset = store.promptPreset.get(store.conversation.effectivePromptPresetId(conversation))
    if (!preset) throw new Error('Prompt preset not found')
    const moduleStates = store.conversationModule
        .list(conversationId)
        .filter((state) => state.enabled)
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

export async function applyEditProcessToMessages(
    messages: Message[],
    context: GenerationContext,
): Promise<{ messages: Message[]; warnings: string[] }> {
    const scripts = collectRegexScripts(context.preset, context.character, context.modules)
    const templateContext = regexTemplateContext(context)
    const results = await Promise.all(
        messages.map((message) =>
            processRegexText({
                text: message.content,
                phase: 'editprocess',
                scripts,
                templateContext,
            }),
        ),
    )
    return {
        messages: messages.map((message, index) => ({
            ...message,
            content: results[index]?.text ?? message.content,
        })),
        warnings: [...new Set(results.flatMap((result) => result.warnings))],
    }
}

export function regexTemplateContext(context: GenerationContext): TemplateContext {
    const toggleValues = Object.fromEntries(
        [...context.preset.toggles, ...context.modules.flatMap((module) => module.toggles)]
            .filter((toggle) => ['boolean', 'select', 'text', 'textarea'].includes(toggle.type))
            .map((toggle) => [
                toggle.key,
                context.settings.promptToggleValues[toggle.key] ?? toggle.defaultValue,
            ]),
    )
    const last = context.messages.at(-1)?.content || ''
    return {
        values: {
            user: context.persona.name,
            char: context.character.name,
            bot: context.character.name,
            persona: context.persona.description,
            description: context.character.description,
            personality: context.character.personality,
            scenario: context.character.scenario,
            exampledialogue: context.character.exampleMessage,
            examplemessage: context.character.exampleMessage,
            firstmessage: context.character.firstMessage,
            authornote: context.conversation.authorNote,
            globalnote: context.character.postHistoryInstructions,
            lastmessage: last,
            lastusermessage:
                context.messages.findLast((message) => message.role === 'user')?.content || '',
            lastcharmessage:
                context.messages.findLast((message) => message.role === 'assistant')?.content || '',
            lastmessageid: String(context.messages.length - 1),
        },
        variables: context.conversation.variables,
        globalVariables: {
            ...context.character.defaultVariables,
            ...context.preset.defaultVariables,
            ...context.settings.globalVariables,
            ...Object.fromEntries(
                Object.entries(toggleValues).map(([key, value]) => [`toggle_${key}`, value]),
            ),
        },
        toggles: Object.fromEntries(
            Object.entries(toggleValues).map(([key, value]) => [
                key,
                value === '1' || value.toLocaleLowerCase() === 'true',
            ]),
        ),
        messages: context.messages.map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
        })),
        modelId: context.modelId,
        moduleNamespaces: context.modules.map((module) => module.namespace).filter(Boolean),
        assets: context.assets,
    }
}

export function normalizeCompiledRole(role: string): 'system' | 'user' | 'assistant' {
    if (role === 'system' || role === 'sys') return 'system'
    if (role === 'user') return 'user'
    return 'assistant'
}

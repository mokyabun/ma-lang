import type {
    AppSettings,
    Character,
    Conversation,
    EffectivePersona,
    Message,
    PromptModule,
    PromptPreset,
} from '@malang/shared'

import type { TemplateContext } from '../template-engine'
import { RisuParser, type ChatTurn } from './parser'

// RisuAI's own toggle checks (the CBS `#when::toggle::key` operator, `parser.svelte.ts`'s
// `isTruthy`) require the stored value to be exactly '1' or 'true' — anything else, including
// '0', '', or arbitrary text, is off. Match that exactly rather than guessing at a blocklist, or
// toggles that read as "on" in RisuAI (e.g. a stray non-'1' value) would read as "off" here, or
// vice versa.
export function isPromptToggleEnabled(value: string): boolean {
    return value === '1' || value === 'true'
}

/**
 * The chat state sendChat parses against: effective toggles (preset declarations, then
 * every active module's), the greeting split off chat.message, and risuChatParser bound
 * to the chat. Prompt assembly and chat display both start from it.
 */
export function loadRisuChat(input: {
    character: Character
    conversation: Conversation
    messages: Message[]
    preset: PromptPreset
    settings: AppSettings
    persona: EffectivePersona
    modules: PromptModule[]
    assets?: TemplateContext['assets']
    modelId?: string
    maxContextTokens?: number
    /** Resolve media CBS to display markup (chat display) instead of URLs (prompts). */
    assetRenderMode?: TemplateContext['assetRenderMode']
    warnings: string[]
}) {
    const { character, conversation, preset, settings, persona, modules, warnings } = input
    // PocketRisu appends customModuleToggle declarations from every active module to the
    // preset declarations. Keep that ordering so a shared key resolves to the same global
    // toggle value while module-only keys work in CBS, templates, lore and prompt injections.
    const declaredToggles = [
        ...preset.toggles,
        ...modules.flatMap((module) => module.toggles),
    ].filter((toggle) => ['boolean', 'select', 'text', 'textarea'].includes(toggle.type))
    const effectiveToggleValues = Object.fromEntries(
        declaredToggles.map((toggle) => [
            toggle.key,
            settings.promptToggleValues[toggle.key] ?? toggle.defaultValue,
        ]),
    )
    const effectiveToggles = Object.fromEntries(
        Object.entries(effectiveToggleValues).map(([key, value]) => [
            key,
            isPromptToggleEnabled(value),
        ]),
    )

    // chat.message excludes the greeting, which PocketRisu derives from fmIndex.
    const stored = input.messages.filter((message) => message.status !== 'failed')
    const greeting = stored[0]?.role === 'assistant' ? stored[0] : null
    const chatMessages = greeting ? stored.slice(1) : stored
    const firstMessage = greeting?.content ?? ''
    const selectedGreeting =
        conversation.greetingIndex >= 0
            ? (character.alternateGreetings[conversation.greetingIndex] ?? '')
            : character.firstMessage

    const parser = new RisuParser(
        {
            values: {
                user: persona.name,
                char: character.name,
                bot: character.name,
                persona: persona.description,
                personaname: persona.name,
                description: character.description,
                personality: character.personality,
                scenario: character.scenario,
                exampledialogue: character.exampleMessage,
                examplemessage: character.exampleMessage,
                firstmessage: character.firstMessage,
                authornote: conversation.authorNote,
                globalnote: character.postHistoryInstructions,
                prefill_supported: 'false',
                jbtoggled: settings.jailbreakToggle ? '1' : '0',
                slot: '',
            },
            globalVariables: {
                ...settings.globalVariables,
                ...Object.fromEntries(
                    Object.entries(effectiveToggleValues).map(([key, value]) => [
                        `toggle_${key}`,
                        value,
                    ]),
                ),
            },
            toggles: effectiveToggles,
            toggleValues: effectiveToggleValues,
            modelId: input.modelId,
            maxContextTokens: input.maxContextTokens,
            moduleNamespaces: modules.map((module) => module.namespace).filter(Boolean),
            assets: input.assets,
            assetRenderMode: input.assetRenderMode,
        },
        conversation.variables,
        // getChatVar: character defaults first, then the preset's template defaults.
        { ...preset.defaultVariables, ...character.defaultVariables },
        chatMessages.map((message): ChatTurn => ({
            id: message.id,
            role: message.role === 'user' ? 'user' : 'char',
            data: message.content,
        })),
        selectedGreeting,
        warnings,
    )
    return {
        parser,
        greeting,
        chatMessages,
        firstMessage,
        effectiveToggles,
        effectiveToggleValues,
    }
}

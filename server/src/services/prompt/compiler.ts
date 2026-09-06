import type {
    AppSettings,
    CompiledMessage,
    Conversation,
    EffectivePersona,
    GenerationParameters,
    Message,
    PromptModule,
    PromptPreset,
    PromptPreview,
} from '@malang/shared'

import type { CharacterRecord } from '@/db'
import { AppError } from '@/errors/app-error'

import { estimateTokens, selectLoreEntries } from './lorebook'
import { renderTemplate, type TemplateContext } from './template-engine'

interface WorkingMessage extends CompiledMessage {
    sourceMessageId?: string
    removable?: boolean
    // Set once a message has already had its role/name baked into `content` (RisuAI's
    // `nameAdded` chat attr). `sendChatAsSystem` skips its own "role: " prefix for these.
    nameAdded?: boolean
}

export class ContextTooLargeError extends AppError {
    constructor() {
        super('context_too_large', 'Fixed prompt content exceeds the configured context window')
    }
}

export function mergeGenerationParameters(
    providerDefaults: GenerationParameters,
    preset: GenerationParameters,
): Required<Pick<GenerationParameters, 'maxContextTokens' | 'maxOutputTokens'>> &
    GenerationParameters {
    const normalize = (parameters: GenerationParameters): GenerationParameters =>
        Object.fromEntries(
            Object.entries(parameters).filter(
                ([, value]) => value !== undefined && value !== -1000,
            ),
        ) as GenerationParameters

    return {
        temperature: 0.9,
        maxContextTokens: 8192,
        maxOutputTokens: 512,
        ...normalize(providerDefaults),
        ...normalize(preset),
    }
}

// RisuAI's own toggle checks (the CBS `#when::toggle::key` operator, `parser.svelte.ts`'s
// `isTruthy`) require the stored value to be exactly '1' or 'true' — anything else, including
// '0', '', or arbitrary text, is off. Match that exactly rather than guessing at a blocklist, or
// toggles that read as "on" in RisuAI (e.g. a stray non-'1' value) would read as "off" here, or
// vice versa.
export function isPromptToggleEnabled(value: string): boolean {
    return value === '1' || value === 'true'
}

export function compilePrompt(input: {
    character: CharacterRecord
    conversation: Conversation
    messages: Message[]
    preset: PromptPreset
    settings: AppSettings
    parameters: GenerationParameters
    modules?: PromptModule[]
    moduleActivationSources?: Record<string, 'default' | 'character' | 'preset' | 'conversation'>
    persona?: EffectivePersona
    assets?: TemplateContext['assets']
    modelId?: string
    includeStartNewChat?: boolean
    longTermMemory?: {
        enabled: boolean
        content: string
        summarizedMessageIds: string[]
        selectedSummaryIds: string[]
        summaryCount: number
        warnings?: string[]
    }
}): PromptPreview {
    const { character, conversation, messages, preset, settings } = input
    const persona: EffectivePersona = input.persona || {
        id: null,
        name: settings.userName,
        description: '',
        avatarAssetId: null,
        source: 'default',
    }
    const modules = input.modules || []
    const warnings = [
        ...preset.warnings,
        ...modules.flatMap((module) => module.warnings),
        ...(input.longTermMemory?.warnings || []),
    ]
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
    const lore = selectLoreEntries(
        [...(character.lorebook || []), ...modules.flatMap((module) => module.lorebook)],
        messages,
        character.loreSettings,
    )
    warnings.push(...lore.warnings)
    const loreAt = (position: string) => lore.entries.filter((entry) => entry.position === position)
    const normalLore = lore.entries.filter((entry) => !entry.position)
    const description = [
        character.description,
        character.personality ? `Description of ${character.name}: ${character.personality}` : '',
        character.scenario
            ? `Circumstances and context of the dialogue: ${character.scenario}`
            : '',
    ]
        .filter(Boolean)
        .join('\n\n')
    const values: Record<string, string> = {
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
        lastmessage: messages.at(-1)?.content || '',
        lastusermessage:
            [...messages].reverse().find((message) => message.role === 'user')?.content || '',
        lastcharmessage:
            [...messages].reverse().find((message) => message.role === 'assistant')?.content ||
            character.firstMessage,
        lastmessageid: String(messages.length - 1),
        slot: '',
    }
    const context: TemplateContext = {
        values,
        variables: conversation.variables,
        globalVariables: {
            ...preset.defaultVariables,
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
        messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
        })),
        modelId: input.modelId,
        maxContextTokens: input.parameters.maxContextTokens,
        moduleNamespaces: modules.map((module) => module.namespace).filter(Boolean),
        assets: input.assets,
    }
    const working: WorkingMessage[] = []

    const resolveNamedPositions = (source: string) => {
        let result = source
        for (let depth = 0; depth < 5; depth += 1) {
            let replaced = false
            result = result.replace(/\{\{position::(.+?)}}/g, (_full, name: string) => {
                replaced = true
                return loreAt(`pt_${name}`)
                    .map((entry) => entry.content)
                    .join('\n')
            })
            if (!replaced) break
        }
        return result.replace(/\{\{position::(.+?)}}/g, '')
    }
    const render = (text: string, slot = '') => {
        const result = renderTemplate(resolveNamedPositions(text.replaceAll('{{slot}}', slot)), {
            ...context,
            values: { ...values, slot },
        })
        warnings.push(...result.warnings)
        return result.text
    }
    const role = (value: 'user' | 'bot' | 'system' | undefined): CompiledMessage['role'] =>
        value === 'bot' ? 'assistant' : value || 'system'
    const push = (message: WorkingMessage) => {
        if (message.content.trim()) working.push(message)
    }

    // The persisted greeting (messages[0]) is RisuAI's synthesized first message, which only
    // ever gets the plain "Char: text" prefix. Every later turn instead gets wrapped in
    // groupTemplate (default `<{{char}}'s Message>\n{{slot}}\n</{{char}}'s Message>`, using the
    // character's name for both user and assistant turns).
    const greetingId = messages[0]?.id
    const groupTemplate =
        preset.promptSettings.groupTemplate ||
        `<{{char}}'s Message>\n{{slot}}\n</{{char}}'s Message>`
    const summarizedMessageIds = new Set(input.longTermMemory?.summarizedMessageIds || [])
    const history: WorkingMessage[] = buildHistory(
        character,
        messages.filter((message) => !summarizedMessageIds.has(message.id)),
    ).map((message) => {
        const isGreeting = message.role === 'assistant' && message.sourceMessageId === greetingId
        if (!preset.promptSettings.sendName) return message
        return {
            ...message,
            content: isGreeting
                ? `${character.name}: ${message.content}`
                : render(groupTemplate, message.content),
            nameAdded: isGreeting,
        }
    })
    // sendChatAsSystem is applied per `chat` block (RisuAI's `chatAsOriginalOnSystem` flag can
    // opt a specific block out), so it happens where `chat` blocks are rendered, not here.

    const addModulePrompts = (position: PromptModule['prompts'][number]['position']) => {
        for (const module of modules) {
            for (const prompt of module.prompts) {
                if (prompt.toggleKey && !Object.hasOwn(effectiveToggles, prompt.toggleKey)) {
                    warnings.push(
                        `Module ${module.name} references undeclared prompt toggle ${prompt.toggleKey}`,
                    )
                }
                if (
                    !prompt.enabled ||
                    prompt.position !== position ||
                    (prompt.toggleKey && !effectiveToggles[prompt.toggleKey])
                ) {
                    continue
                }
                push({ role: role(prompt.role), content: render(prompt.content) })
            }
        }
    }

    // RisuAI gates every `jailbreak`/`cot` block behind one global switch each
    // (db.jailbreakToggle / db.chainOfThought), independent of the block's own `enabled` flag.
    const blockRuns = (block: { type: string }) =>
        (block.type !== 'jailbreak' || settings.jailbreakToggle) &&
        (block.type !== 'cot' || settings.chainOfThought)
    const hasMain = preset.blocks.some(
        (block) =>
            block.enabled &&
            !('raw' in block) &&
            (block.type === 'plain' || block.type === 'jailbreak' || block.type === 'cot') &&
            block.type2 === 'main' &&
            blockRuns(block),
    )
    const hasChat = preset.blocks.some(
        (block) => block.enabled && !('raw' in block) && block.type === 'chat',
    )
    let afterMainAdded = false
    let beforeChatAdded = false
    let afterChatAdded = false
    let longTermMemoryAdded = false
    const addLongTermMemory = () => {
        if (longTermMemoryAdded || !input.longTermMemory?.content.trim()) return
        push({ role: 'system', content: input.longTermMemory.content, removable: false })
        longTermMemoryAdded = true
    }
    addModulePrompts('beforeMain')
    if (!hasMain) {
        addModulePrompts('afterMain')
        afterMainAdded = true
    }

    for (const block of preset.blocks) {
        if (!block.enabled || 'raw' in block) continue
        if (block.type === 'plain' || block.type === 'jailbreak' || block.type === 'cot') {
            if (!blockRuns(block)) continue
            let text = block.text
            if (block.type2 === 'main' && character.systemPrompt) {
                text = character.systemPrompt.includes('{{original}}')
                    ? character.systemPrompt.replaceAll('{{original}}', text)
                    : character.systemPrompt
            }
            if (block.type2 === 'globalNote' && character.postHistoryInstructions) {
                text = character.postHistoryInstructions.includes('{{original}}')
                    ? character.postHistoryInstructions.replaceAll('{{original}}', text)
                    : character.postHistoryInstructions
            }
            push({ role: role(block.role), content: render(text) })
            if (block.type2 === 'main' && !afterMainAdded) {
                addModulePrompts('afterMain')
                afterMainAdded = true
            }
            continue
        }
        if (block.type === 'description') {
            const before = loreAt('before_desc')
                .map((entry) => entry.content)
                .join('\n')
            const after = loreAt('after_desc')
                .concat(loreAt('personality'), loreAt('scenario'))
                .map((entry) => entry.content)
                .join('\n')
            push({
                role: role(block.role2),
                content: render(
                    block.innerFormat || '{{slot}}',
                    [before, description, after].filter(Boolean).join('\n\n'),
                ),
            })
            continue
        }
        if (block.type === 'persona') {
            push({
                role: role(block.role2),
                content: render(block.innerFormat || '{{slot}}', persona.description),
            })
            continue
        }
        if (block.type === 'lorebook') {
            for (const entry of normalLore)
                push({
                    role: block.role2 ? role(block.role2) : entry.role,
                    content: render(block.innerFormat || '{{slot}}', entry.content),
                })
            continue
        }
        if (block.type === 'authornote') {
            const note = conversation.authorNote || block.defaultText || ''
            push({
                role: role(block.role2),
                content: render(block.innerFormat || '{{slot}}', note),
            })
            continue
        }
        if (block.type === 'chat') {
            if (!beforeChatAdded) {
                addModulePrompts('beforeChat')
                addLongTermMemory()
                beforeChatAdded = true
            }
            const end =
                block.rangeEnd === 'end'
                    ? history.length
                    : normalizeIndex(block.rangeEnd, history.length)
            const start = normalizeIndex(block.rangeStart, history.length)
            const systemize =
                preset.promptSettings.sendChatAsSystem && !block.chatAsOriginalOnSystem
            for (const message of history.slice(start, end)) {
                push(
                    systemize
                        ? {
                              ...message,
                              role: 'system',
                              content: message.nameAdded
                                  ? message.content
                                  : `${message.role}: ${message.content}`,
                          }
                        : { ...message },
                )
            }
            if (!afterChatAdded) {
                addModulePrompts('afterChat')
                afterChatAdded = true
            }
            continue
        }
        if (block.type === 'chatML') {
            for (const message of parseChatMl(render(block.text))) push(message)
            continue
        }
        if (block.type === 'postEverything') {
            for (const entry of [...loreAt('depth'), ...loreAt('reverse_depth')].filter(
                (entry) => entry.depth === 0,
            )) {
                push({ role: entry.role, content: render(entry.content) })
            }
            continue
        }
    }

    if (!afterMainAdded) addModulePrompts('afterMain')
    if (!hasChat || !beforeChatAdded) {
        addModulePrompts('beforeChat')
        addLongTermMemory()
    }
    if (!hasChat || !afterChatAdded) addModulePrompts('afterChat')

    // PocketRisu appends this synthetic turn on its chat path. The caller gates
    // it to Gemini here so providers with different classic semantics do not
    // change as a side effect of the Gemini compatibility work.
    if (input.includeStartNewChat && !preset.promptSettings.trimStartNewChat) {
        push({ role: 'system', content: '[Start a new chat]', removable: false })
    }

    if (preset.promptSettings.assistantPrefill.trim()) {
        push({
            role: 'assistant',
            content: render(preset.promptSettings.assistantPrefill),
            removable: false,
        })
    }

    for (const entry of lore.entries.filter(
        (item) =>
            (item.position === 'depth' || item.position === 'reverse_depth') && item.depth > 0,
    )) {
        const fromEnd = entry.position === 'depth'
        const index = fromEnd
            ? Math.max(0, working.length - entry.depth)
            : Math.min(working.length, entry.depth)
        working.splice(index, 0, { role: entry.role, content: render(entry.content) })
    }

    const parameters = input.parameters
    const maxContext = parameters.maxContextTokens || 8192
    const reservedOutputTokens = parameters.maxOutputTokens || 512
    const available = maxContext - reservedOutputTokens
    const trimmedMessageIds: string[] = []
    let total = working.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
    if (total > available) {
        for (let index = 0; index < working.length && total > available; index += 1) {
            const message = working[index]
            if (!message) continue
            if (!message.removable) continue
            total -= estimateMessageTokens(message)
            if (message.sourceMessageId) trimmedMessageIds.push(message.sourceMessageId)
            working.splice(index, 1)
            index -= 1
        }
    }
    if (total > available) throw new ContextTooLargeError()
    return {
        messages: mergeAdjacentSystemMessages(working).map(({ role: itemRole, content }) => ({
            role: itemRole,
            content,
        })),
        estimatedInputTokens: total,
        reservedOutputTokens,
        activatedLoreIds: lore.entries.map((entry) => entry.id),
        activeModuleIds: modules.map((module) => module.id),
        activeModules: modules.map((module) => ({
            id: module.id,
            source: input.moduleActivationSources?.[module.id] || ('default' as const),
        })),
        effectiveToggles: effectiveToggleValues,
        activeRegexScriptIds: {
            editinput: activeRegexIds(preset, character, modules, 'editinput'),
            editprocess: activeRegexIds(preset, character, modules, 'editprocess'),
            editoutput: activeRegexIds(preset, character, modules, 'editoutput'),
            editdisplay: activeRegexIds(preset, character, modules, 'editdisplay'),
        },
        trimmedMessageIds,
        warnings: [...new Set(warnings)],
        persona,
        longTermMemory: input.longTermMemory
            ? {
                  enabled: input.longTermMemory.enabled,
                  summaryCount: input.longTermMemory.summaryCount,
                  selectedSummaryIds: input.longTermMemory.selectedSummaryIds,
              }
            : undefined,
    }
}

function activeRegexIds(
    preset: PromptPreset,
    character: CharacterRecord,
    modules: PromptModule[],
    phase: 'editinput' | 'editprocess' | 'editoutput' | 'editdisplay',
) {
    return [
        ...preset.regexScripts,
        ...character.regexScripts,
        ...modules.flatMap((module) => module.regexScripts),
    ]
        .filter((script) => script.enabled && script.phase === phase)
        .map((script) => script.id)
}

function buildHistory(character: CharacterRecord, messages: Message[]): WorkingMessage[] {
    const examples = parseExamples(character.exampleMessage, character.name)
    return [
        ...examples,
        ...messages
            .filter((message) => message.status !== 'failed')
            .map((message, index) => ({
                role: message.role,
                content: message.content,
                sourceMessageId: message.id,
                removable: index > 0 && index < messages.length - 1,
            })),
    ]
}

function parseExamples(source: string, characterName: string): WorkingMessage[] {
    if (!source.trim()) return []
    const result: WorkingMessage[] = []
    let current: WorkingMessage | null = null
    for (const line of source.replaceAll('<START>', '').split(/\r?\n/)) {
        const match = line.match(/^\s*(\{\{user}}|\{\{char}}|[^:]{1,100}):\s*(.*)$/i)
        if (match) {
            if (current) result.push(current)
            const speaker = (match[1] || '').toLocaleLowerCase()
            current = {
                role: speaker === '{{user}}' ? 'user' : 'assistant',
                content: match[2] || '',
                removable: false,
            }
        } else if (current) {
            current.content += `\n${line}`
        }
    }
    if (current) result.push(current)
    if (!result.length)
        result.push({
            role: 'system',
            content: `Example dialogue with ${characterName}:\n${source}`,
            removable: false,
        })
    return result
}

function parseChatMl(source: string): WorkingMessage[] {
    const result: WorkingMessage[] = []
    const regex =
        /@@(system|user|assistant|bot)\s*\n([\s\S]*?)(?=@@(?:system|user|assistant|bot)\s*\n|$)/gi
    for (const match of source.matchAll(regex)) {
        const parsedRole = (match[1] || 'system').toLowerCase()
        result.push({
            role: parsedRole === 'bot' ? 'assistant' : (parsedRole as CompiledMessage['role']),
            content: (match[2] || '').trim(),
        })
    }
    return result
}

function normalizeIndex(index: number, length: number): number {
    if (index < 0) return Math.max(0, length + index)
    return Math.min(length, index)
}

function estimateMessageTokens(message: CompiledMessage): number {
    return estimateTokens(message.content) + 4
}

function mergeAdjacentSystemMessages(messages: WorkingMessage[]): WorkingMessage[] {
    const result: WorkingMessage[] = []
    for (const message of messages) {
        const previous = result.at(-1)
        if (
            message.role === 'system' &&
            previous?.role === 'system' &&
            !message.sourceMessageId &&
            !previous.sourceMessageId
        ) {
            previous.content += `\n\n${message.content}`
        } else {
            result.push({ ...message })
        }
    }
    return result
}

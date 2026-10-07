import type {
    AppSettings,
    BiasEntry,
    CompiledMessage,
    Conversation,
    EffectivePersona,
    GenerationParameters,
    Message,
    PromptBlock,
    PromptModule,
    PromptPreset,
    PromptPreview,
} from '@malang/shared'

import type { CharacterRecord } from '@/db'
import { AppError } from '@/errors/app-error'
import type { ChatTokenizer } from '@/services/tokenizer'

import { loadRisuChat } from './pocketrisu/chat'
import { exampleMessage } from './pocketrisu/example-messages'
import { loadLoreBookV3Prompt, toRisuLore } from './pocketrisu/lorebook'
import { collectRegexScripts, processScripts, RegexSandbox } from './pocketrisu/scripts'
import type { RisuChat } from './pocketrisu/types'
import type { TemplateContext } from './template-engine'

// Port of PocketRisu's sendChat prompt-template path, quirks included. Comments name the
// mirrored step; Malang-only additions are marked.

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

export { isPromptToggleEnabled } from './pocketrisu/chat'

type BlockRole = 'user' | 'bot' | 'system'
type KnownBlock = Exclude<PromptBlock, { raw: Record<string, unknown> }>
const convertPromptRole = { system: 'system', user: 'user', bot: 'assistant' } as const

/** PocketRisu's chatML card syntax (parser/chatML.ts). */
function parseChatML(data: string, parse: (text: string) => string): RisuChat[] | null {
    const starter = '<|im_start|>'
    const separator = '<|im_sep|>'
    const ender = '<|im_end|>'
    const trimmed = data.trim()
    if (!trimmed.startsWith(starter)) return null
    return trimmed
        .split(starter)
        .filter((part) => part !== '')
        .map((part) => {
            let role: RisuChat['role'] = 'user'
            let value = part
            if (value.startsWith(`user${separator}`)) {
                value = value.substring(4 + separator.length)
            } else if (value.startsWith(`system${separator}`)) {
                role = 'system'
                value = value.substring(6 + separator.length)
            } else if (value.startsWith(`assistant${separator}`)) {
                role = 'assistant'
                value = value.substring(9 + separator.length)
            } else if (value.startsWith('user ') || value.startsWith('user\n')) {
                value = value.substring(5)
            } else if (value.startsWith('system ') || value.startsWith('system\n')) {
                role = 'system'
                value = value.substring(7)
            } else if (value.startsWith('assistant ') || value.startsWith('assistant\n')) {
                role = 'assistant'
                value = value.substring(10)
            }
            value = value.trim()
            if (value.endsWith(ender)) value = value.substring(0, value.length - ender.length)
            const thoughts: string[] = []
            value = value.replace(/<Thoughts>(.+)<\/Thoughts>/gms, (_match, inner: string) => {
                thoughts.push(inner)
                return ''
            })
            return { role, content: parse(value), thoughts }
        })
}

function systemizeChat(chats: RisuChat[]): RisuChat[] {
    for (const chat of chats) {
        if (chat.role === 'user' || chat.role === 'assistant') {
            const attr = chat.attr ?? []
            if (chat.name?.startsWith('example_')) chat.content = `${chat.name}: ${chat.content}`
            else if (!attr.includes('nameAdded')) chat.content = `${chat.role}: ${chat.content}`
            chat.role = 'system'
            delete chat.memo
            delete chat.name
        }
    }
    return chats
}

/** A raw PocketRisu card Malang does not model, such as `memory`. */
function rawCard(block: PromptBlock): Record<string, unknown> | null {
    return 'raw' in block ? block.raw : null
}

export async function compilePrompt(input: {
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
    tokenizer: ChatTokenizer
    /** PocketRisu adds `[Start a new chat]` for every model except NovelAI. */
    includeStartNewChat?: boolean
    /** PocketRisu merges consecutive system turns only for GPT/Claude-family models. */
    mergeSystemMessages?: boolean
    longTermMemory?: {
        enabled: boolean
        content: string
        summarizedMessageIds: string[]
        selectedSummaryIds: string[]
        summaryCount: number
        warnings?: string[]
    }
}): Promise<PromptPreview> {
    const { character, conversation, preset, settings } = input
    const persona: EffectivePersona = input.persona || {
        id: null,
        name: settings.userName,
        description: '',
        avatarAssetId: null,
        source: 'default',
    }
    const modules = input.modules || []
    const promptSettings = preset.promptSettings
    const warnings = [
        ...preset.warnings,
        ...modules.flatMap((module) => module.warnings),
        ...(input.longTermMemory?.warnings || []),
    ]

    const { parser, greeting, firstMessage, effectiveToggles, effectiveToggleValues } =
        loadRisuChat({
            character,
            conversation,
            messages: input.messages,
            preset,
            settings,
            persona,
            modules,
            assets: input.assets,
            modelId: input.modelId,
            maxContextTokens: input.parameters.maxContextTokens,
            warnings,
        })
    const parse = (text: string, role?: string) => parser.parse(text, { role })
    const tokenizeChat = (chat: RisuChat) => input.tokenizer.tokenizeChat(chat)
    const tokenizeChats = (chats: RisuChat[]) =>
        chats.reduce((sum, chat) => sum + tokenizeChat(chat), 0)

    // runCurrentChatFunction: every stored message runs its variable commands once, in order.
    for (const [index, turn] of parser.chat.entries()) {
        parser.setData(index, parser.parse(turn.data, { runVar: true }))
    }

    const regexScripts = collectRegexScripts(preset, character, modules)
    const sandbox = new RegexSandbox()
    try {
        const unformated = {
            chats: [] as RisuChat[],
            lorebook: [] as RisuChat[],
            authorNote: [] as RisuChat[],
            description: [] as RisuChat[],
            postEverything: [] as RisuChat[],
            personaPrompt: [] as RisuChat[],
        }

        const template: PromptBlock[] = preset.blocks.filter(
            (block) => block.enabled || rawCard(block)?.type === 'memory',
        )
        if (!template.some((block) => block.type === 'postEverything')) {
            template.push({ id: 'postEverything', enabled: true, type: 'postEverything' })
        }
        const authorNoteCard = preset.blocks.find((block) => block.type === 'authornote')
        const authorNoteDefault =
            authorNoteCard && 'defaultText' in authorNoteCard
                ? (authorNoteCard.defaultText ?? '')
                : ''

        if (conversation.authorNote) {
            unformated.authorNote.push({ role: 'system', content: parse(conversation.authorNote) })
        } else if (authorNoteDefault !== '') {
            unformated.authorNote.push({ role: 'system', content: parse(authorNoteDefault) })
        }

        if (settings.chainOfThought) {
            unformated.postEverything.push({
                role: 'system',
                content: `<instruction> - before respond everything, Think step by step as a ai assistant how would you respond inside <Thoughts> xml tag. this must be less than 5 paragraphs.</instruction>`,
            })
        }

        let description = parse(character.description)
        if (character.personality) {
            description += parse(`\n\nDescription of {{char}}: ${character.personality}`)
        }
        if (character.scenario) {
            description += parse(
                `\n\nCircumstances and context of the dialogue: ${character.scenario}`,
            )
        }
        const baseDescriptionPrompt: RisuChat = { role: 'system', content: description }
        unformated.description.push(baseDescriptionPrompt)

        const lore = [
            ...(character.lorebook || [])
                .filter((entry) => entry.enabled)
                .map((entry) => ({
                    ...toRisuLore(entry, character.loreExtensions?.[entry.id]),
                    // convertCharbook does not carry card entry ids into the loreBook.
                    id: undefined,
                })),
            ...modules.flatMap((module) =>
                module.lorebook.filter((entry) => entry.enabled).map((entry) => toRisuLore(entry)),
            ),
        ]
        const lorepmt = loadLoreBookV3Prompt({
            lore,
            messages: parser.chat.map((turn) => ({ role: turn.role, data: turn.data })),
            userName: persona.name,
            charName: character.name,
            fmIndex: conversation.greetingIndex,
            settings: character.loreSettings,
            getChatVar: (key) => parser.getChatVar(key),
            setChatVar: (key, value) => parser.setChatVar(key, value),
            parse: (text) => parse(text),
            countTokens: (text) => input.tokenizer.count(text),
        })

        const positionRegex = /{{position::(.+?)}}/g
        const replacePosition = (text: string) => {
            let replaced = false
            const result = text.replace(positionRegex, (_match, name: string) => {
                replaced = true
                return lorepmt.actives
                    .filter((active) => active.pos === `pt_${name}`)
                    .map((active) => active.prompt)
                    .join('\n')
            })
            return { text: result, replaced }
        }
        const resolvePosition = (text: string, maxDepth = 5) => {
            let result = text
            for (let index = 0; index < maxDepth; index += 1) {
                const next = replacePosition(result)
                result = next.text
                if (!next.replaced) break
            }
            return result.replace(positionRegex, '')
        }

        for (const active of lorepmt.actives.filter((lore) => lore.pos === '' && !lore.inject)) {
            unformated.lorebook.push({
                role: active.role,
                content: parse(resolvePosition(active.prompt)),
            })
        }

        const beforeDescriptionPrompts: RisuChat[] = []
        const afterDescriptionPrompts: RisuChat[] = []
        for (const active of lorepmt.actives.filter((lore) =>
            ['after_desc', 'before_desc', 'personality', 'scenario'].includes(lore.pos),
        )) {
            const chat: RisuChat = {
                role: active.role,
                content: parse(resolvePosition(active.prompt)),
            }
            if (active.pos === 'before_desc') {
                beforeDescriptionPrompts.unshift(chat)
                unformated.description.unshift(chat)
            } else {
                afterDescriptionPrompts.push(chat)
                unformated.description.push(chat)
            }
        }

        if (persona.description) {
            unformated.personaPrompt.push({ role: 'system', content: parse(persona.description) })
        }

        for (const active of lorepmt.actives.filter(
            (lore) => lore.pos === 'depth' && lore.depth === 0 && lore.role !== 'assistant',
        )) {
            unformated.postEverything.push({
                role: active.role,
                content: parse(resolvePosition(active.prompt)),
            })
        }
        const injectionLorebooks = lorepmt.actives.filter(
            (lore) => lore.inject && !lore.inject.lore,
        )
        const injectionLorePosSet = new Set(
            injectionLorebooks.map((lore) => lore.inject?.location ?? ''),
        )
        // Assistant lore goes last so it can act as a prefill.
        for (const active of lorepmt.actives.filter(
            (lore) => lore.pos === 'depth' && lore.depth === 0 && lore.role === 'assistant',
        )) {
            unformated.postEverything.push({
                role: active.role,
                content: parse(resolvePosition(active.prompt)),
            })
        }

        const positionParser = (text: string, location: string) => {
            if (injectionLorePosSet.has(location)) {
                for (const lore of injectionLorebooks.filter(
                    (active) => active.inject?.location === location,
                )) {
                    if (lore.inject?.operation === 'append') text += ` ${lore.prompt}`
                    else if (lore.inject?.operation === 'prepend') text = `${lore.prompt} ${text}`
                    else if (lore.inject) text = text.replace(lore.inject.param, lore.prompt)
                }
            }
            return resolvePosition(text)
        }

        const applyPromptBlockRole = (chats: RisuChat[], role?: BlockRole) => {
            if (!role) return
            for (const chat of chats) chat.role = convertPromptRole[role]
        }
        const getDescriptionPrompts = (role?: BlockRole) => {
            const prompts = [
                ...structuredClone(beforeDescriptionPrompts),
                structuredClone(baseDescriptionPrompt),
                ...structuredClone(afterDescriptionPrompts),
            ]
            applyPromptBlockRole([prompts[beforeDescriptionPrompts.length]!], role)
            return prompts
        }

        /** The prompts a template card contributes; PocketRisu builds them the same way in both passes. */
        const cardPrompts = (block: KnownBlock): RisuChat[] => {
            switch (block.type) {
                case 'persona': {
                    const prompts = structuredClone(unformated.personaPrompt)
                    applyPromptBlockRole(prompts, block.role2)
                    if (block.innerFormat && prompts.length > 0) {
                        for (const prompt of prompts) {
                            prompt.content = parse(
                                positionParser(block.innerFormat, block.type),
                            ).replace('{{slot}}', prompt.content)
                        }
                    }
                    return prompts
                }
                case 'description': {
                    const prompts = getDescriptionPrompts(block.role2)
                    if (block.innerFormat && prompts.length > 0) {
                        for (const prompt of prompts) {
                            prompt.content = parse(
                                positionParser(block.innerFormat, block.type),
                            ).replace('{{slot}}', prompt.content)
                        }
                    }
                    return prompts
                }
                case 'authornote': {
                    const prompts = structuredClone(unformated.authorNote)
                    applyPromptBlockRole(prompts, block.role2)
                    if (block.innerFormat && prompts.length > 0) {
                        for (const prompt of prompts) {
                            prompt.content = parse(
                                positionParser(block.innerFormat, block.type),
                            ).replace('{{slot}}', prompt.content || block.defaultText || '')
                        }
                    }
                    return prompts
                }
                case 'lorebook':
                    return unformated.lorebook
                case 'postEverything':
                    return promptSettings.postEndInnerFormat
                        ? [
                              ...unformated.postEverything,
                              { role: 'system', content: promptSettings.postEndInnerFormat },
                          ]
                        : unformated.postEverything
                case 'plain':
                case 'jailbreak':
                case 'cot': {
                    if (!settings.jailbreakToggle && block.type === 'jailbreak') return []
                    if (!settings.chainOfThought && block.type === 'cot') return []
                    const posType = block.type === 'plain' ? block.type2 : block.type
                    let content = positionParser(block.text, posType)
                    if (block.type2 === 'globalNote' && character.postHistoryInstructions) {
                        content = positionParser(
                            character.postHistoryInstructions,
                            posType,
                        ).replaceAll('{{original}}', content)
                    }
                    return [
                        {
                            role: convertPromptRole[block.role],
                            content: parse(content, block.role),
                        },
                    ]
                }
                case 'chatML':
                    return parseChatML(block.text, (text) => parse(text)) ?? []
                case 'chat':
                    return []
            }
        }

        let supaMemoryCardUsed = template.some((block) => rawCard(block)?.type === 'memory')

        // Fixed prompt cost, for the history budget below (PocketRisu's first template pass).
        const reservedOutputTokens = input.parameters.maxOutputTokens || 512
        const maxContextTokens = input.parameters.maxContextTokens || 8192
        let currentTokens = reservedOutputTokens + 50
        // A chat card counts nothing here: PocketRisu tokenizes `unformated.chats` while still empty.
        for (const card of template) {
            if (!rawCard(card)) currentTokens += tokenizeChats(cardPrompts(card as KnownBlock))
        }

        const examples = exampleMessage(character.exampleMessage, character.name, parse)
        currentTokens += tokenizeChats(examples)
        // `[Start a new chat]` is never counted, though trimming it below subtracts it.
        let chats: RisuChat[] = examples
        if (input.includeStartNewChat !== false && !promptSettings.trimStartNewChat) {
            chats.push({ role: 'system', content: '[Start a new chat]', memo: 'NewChat' })
        }

        const summarized = new Set(input.longTermMemory?.summarizedMessageIds || [])
        if (greeting && !summarized.has(greeting.id)) {
            const chat: RisuChat = {
                role: 'assistant',
                content: await processScripts({
                    scripts: regexScripts,
                    data: parse(firstMessage),
                    mode: 'editprocess',
                    chatId: -1,
                    parse: (text) => parse(text),
                    sandbox,
                    warnings,
                }),
                sourceMessageId: greeting.id,
            }
            if (promptSettings.sendName) {
                chat.content = `${character.name}: ${chat.content}`
                chat.attr = ['nameAdded']
            }
            chats.push(chat)
            currentTokens += tokenizeChat(chat)
        }

        for (const [index, turn] of parser.chat.entries()) {
            if (summarized.has(turn.id)) continue
            let formatedChat = await processScripts({
                scripts: regexScripts,
                data: parse(turn.data, turn.role),
                mode: 'editprocess',
                chatId: index,
                parse: (text) => parser.parse(text, { chatId: index }),
                parser,
                sandbox,
                warnings,
            })
            // Inlay tags become multimodal attachments; their text is always dropped.
            formatedChat = formatedChat.replace(/{{(inlay|inlayed|inlayeddata)::(.+?)}}/g, '')
            if (promptSettings.sendName) {
                const form =
                    promptSettings.groupTemplate ||
                    `<{{char}}'s Message>\n{{slot}}\n</{{char}}'s Message>`
                formatedChat = parse(form).replace('{{slot}}', formatedChat)
            }
            const thoughts: string[] = []
            formatedChat = formatedChat.replace(
                /<Thoughts>(.+)<\/Thoughts>/gms,
                (_match, inner: string) => {
                    thoughts.push(inner)
                    return ''
                },
            )
            // asset_prompt images are attachments; the tag itself never reaches the text.
            formatedChat = formatedChat.replace(/\{\{asset_?prompt::(.+?)\}\}/gimsu, '')
            const chat: RisuChat = {
                role: turn.role === 'user' ? 'user' : 'assistant',
                content: formatedChat,
                memo: turn.id,
                attr: [],
                thoughts,
                sourceMessageId: turn.id,
            }
            chats.push(chat)
            currentTokens += tokenizeChat(chat)
        }

        const depthPrompts = lorepmt.actives.filter(
            (lore) => (lore.pos === 'depth' && lore.depth > 0) || lore.pos === 'reverse_depth',
        )
        for (const depthPrompt of depthPrompts) {
            currentTokens += tokenizeChat({
                role: depthPrompt.role,
                content: parse(resolvePosition(depthPrompt.prompt)),
            })
        }

        // Malang: HypaV3 summaries take the place of PocketRisu's supaMemory turn.
        if (input.longTermMemory?.content.trim()) {
            const memory: RisuChat = {
                role: 'system',
                content: input.longTermMemory.content,
                memo: 'supaMemory',
            }
            chats = [memory, ...chats]
            currentTokens += tokenizeChat(memory)
        }

        const trimmedMessageIds: string[] = []
        while (currentTokens > maxContextTokens) {
            if (chats.length <= 1) throw new ContextTooLargeError()
            const removed = chats.shift()!
            currentTokens -= tokenizeChat(removed)
            if (removed.sourceMessageId) trimmedMessageIds.push(removed.sourceMessageId)
        }

        const bias = preset.bias
            .concat(character.bias)
            .map(([text, value]): BiasEntry => [parser.parse(unescapeBiasText(text)), value])

        const memories: RisuChat[] = []
        unformated.chats = chats
            .map((chat): RisuChat => {
                if (chat.memo !== 'supaMemory' && chat.memo !== 'hypaMemory') {
                    chat.removable = true
                } else if (supaMemoryCardUsed) {
                    memories.push(chat)
                    return { role: 'system', content: '' }
                } else {
                    chat.content = `<Previous Conversation>${chat.content}</Previous Conversation>`
                }
                return chat
            })
            .filter((chat) => chat.content.trim() !== '')

        for (const depthPrompt of depthPrompts) {
            const chat: RisuChat = {
                role: depthPrompt.role,
                content: parse(resolvePosition(depthPrompt.prompt)),
            }
            const depth =
                depthPrompt.pos === 'depth'
                    ? depthPrompt.depth
                    : unformated.chats.length - depthPrompt.depth
            unformated.chats.splice(depth, 0, chat)
        }

        let formated: RisuChat[] = []
        const pushPrompts = (chats: RisuChat[]) => {
            for (const chat of chats) {
                if (!chat.content.trim()) continue
                if (!input.mergeSystemMessages) {
                    formated.push(chat)
                    continue
                }
                const end = formated.at(-1)
                if (
                    chat.role === 'system' &&
                    end?.role === 'system' &&
                    end.memo === chat.memo &&
                    end.name === chat.name
                ) {
                    end.content += `\n\n${chat.content}`
                } else {
                    formated.push(chat)
                }
            }
        }

        // Malang: module prompts at their declared positions around main and chat.
        const pushModulePrompts = (position: PromptModule['prompts'][number]['position']) => {
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
                    pushPrompts([
                        {
                            role: convertPromptRole[prompt.role ?? 'system'],
                            content: parse(prompt.content),
                        },
                    ])
                }
            }
        }
        const modulePositions = new Set<string>()
        const pushModulePromptsOnce = (position: PromptModule['prompts'][number]['position']) => {
            if (modulePositions.has(position)) return
            modulePositions.add(position)
            pushModulePrompts(position)
        }

        pushModulePromptsOnce('beforeMain')
        if (
            !template.some(
                (block) => block.type === 'plain' && 'type2' in block && block.type2 === 'main',
            )
        ) {
            pushModulePromptsOnce('afterMain')
        }

        for (const card of template) {
            const raw = rawCard(card)
            if (raw) {
                if (raw.type === 'memory') {
                    const prompts = structuredClone(memories)
                    applyPromptBlockRole(prompts, raw.role2 as BlockRole | undefined)
                    const innerFormat = typeof raw.innerFormat === 'string' ? raw.innerFormat : ''
                    if (innerFormat) {
                        for (const prompt of prompts) {
                            prompt.content = parse(innerFormat).replace('{{slot}}', prompt.content)
                        }
                    }
                    pushPrompts(prompts)
                }
                continue
            }
            const block = card as KnownBlock
            switch (block.type) {
                case 'chat': {
                    pushModulePromptsOnce('beforeChat')
                    let start = block.rangeStart
                    let end = block.rangeEnd === 'end' ? unformated.chats.length : block.rangeEnd
                    if (start === -1000) {
                        start = 0
                        end = unformated.chats.length
                    }
                    if (start < 0) start = Math.max(0, unformated.chats.length + start)
                    if (end < 0) end = Math.max(0, unformated.chats.length + end)
                    if (start < end) {
                        let chats = unformated.chats.slice(start, end)
                        if (promptSettings.sendChatAsSystem && !block.chatAsOriginalOnSystem) {
                            chats = systemizeChat(chats)
                        }
                        pushPrompts(chats)
                    }
                    pushModulePromptsOnce('afterChat')
                    break
                }
                default:
                    pushPrompts(cardPrompts(block))
                    if (block.type === 'plain' && block.type2 === 'main') {
                        pushModulePromptsOnce('afterMain')
                    }
            }
        }
        pushModulePromptsOnce('afterMain')
        pushModulePromptsOnce('beforeChat')
        pushModulePromptsOnce('afterChat')

        formated = formated.map((chat) => {
            chat.content = chat.content.trim()
            return chat
        })

        // Token recheck: blank out removable turns from the front until the prompt fits.
        // PocketRisu compares against the whole context here; the output reservation is not subtracted.
        let inputTokens = tokenizeChats(formated)
        if (inputTokens > maxContextTokens) {
            let pointer = 0
            while (inputTokens > maxContextTokens) {
                if (pointer >= formated.length) throw new ContextTooLargeError()
                const chat = formated[pointer]!
                if (chat.removable) {
                    inputTokens -= tokenizeChat(chat)
                    chat.content = ''
                    if (chat.sourceMessageId) trimmedMessageIds.push(chat.sourceMessageId)
                }
                pointer += 1
            }
            formated = formated.filter((chat) => chat.content !== '')
        }

        return {
            messages: formated.map(({ role, content }): CompiledMessage => ({ role, content })),
            estimatedInputTokens: inputTokens,
            reservedOutputTokens,
            activatedLoreIds: [...new Set(lorepmt.actives.map((active) => active.sourceId))],
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
            bias,
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
    } finally {
        sandbox.close()
    }
}

function unescapeBiasText(text: string): string {
    return text.replaceAll('\\n', '\n').replaceAll('\\r', '\r').replaceAll('\\\\', '\\')
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

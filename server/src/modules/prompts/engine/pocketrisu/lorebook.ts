import type { LoreEntry } from '@malang/shared'
import { CCardLib } from '@risuai/ccardlib'

import type { RisuLore } from './types'

// Port of PocketRisu's convertCharbook and loadLoreBookV3Prompt.

export interface ActiveLore {
    depth: number
    pos: string
    prompt: string
    role: 'system' | 'user' | 'assistant'
    order: number
    tokens: number
    priority: number
    source: string
    inject: {
        operation: 'append' | 'prepend' | 'replace'
        location: string
        param: string
        lore: boolean
    } | null
    sourceId: string
}

export interface LoreChatMessage {
    role: 'user' | 'char'
    data: string
}

/** Decorators for structured-form fields; prepended, so decorators in the content win. */
function structuredDecorators(entry: LoreEntry): string[] {
    const lines: string[] = []
    if (entry.position === 'depth' || entry.position === 'reverse_depth') {
        lines.push(`@@${entry.position} ${entry.depth}`)
    } else if (entry.position) {
        lines.push(`@@position ${entry.position}`)
    }
    if (entry.role !== 'system') lines.push(`@@role ${entry.role}`)
    if (entry.scanDepth !== undefined) lines.push(`@@scan_depth ${entry.scanDepth}`)
    if (entry.probability !== 100) lines.push(`@@probability ${entry.probability}`)
    if (entry.additionalKeys.length)
        lines.push(`@@additional_keys ${entry.additionalKeys.join(',')}`)
    if (entry.excludeKeys.length) lines.push(`@@exclude_keys ${entry.excludeKeys.join(',')}`)
    if (entry.fullWordMatching === true) lines.push('@@match_full_word')
    if (entry.fullWordMatching === false) lines.push('@@match_partial_word')
    if (entry.recursive === 'enabled') lines.push('@@recursive')
    if (entry.recursive === 'disabled') lines.push('@@unrecursive')
    return lines
}

/** convertCharbook's per-entry migration of card `extensions` into decorators. */
function cardExtensionDecorators(
    content: string,
    extensions: Record<string, unknown>,
    secondaryKeys: string[],
): { content: string; selective?: boolean } {
    let selective: boolean | undefined
    if (
        extensions.useProbability &&
        extensions.probability !== undefined &&
        extensions.probability !== 100
    ) {
        content = `@@probability ${extensions.probability as number | string}\n${content}`
    }
    if (
        extensions.position === 4 &&
        typeof extensions.depth === 'number' &&
        typeof extensions.role === 'number'
    ) {
        content = `@@depth ${extensions.depth}\n@@role ${['system', 'user', 'assistant'][extensions.role]}\n${content}`
    }
    if (typeof extensions.selectiveLogic === 'number' && secondaryKeys.length > 0) {
        switch (extensions.selectiveLogic) {
            case 1:
                selective = false
                content = `@@exclude_keys_all ${secondaryKeys.join(',')}\n${content}`
                break
            case 2:
                selective = false
                for (const key of secondaryKeys) content = `@@exclude_keys ${key}\n${content}`
                break
            case 3:
                selective = false
                for (const key of secondaryKeys) content = `@@additional_keys ${key}\n${content}`
                break
        }
    }
    if (typeof extensions.delay === 'number' && extensions.delay > 0) {
        content = `@@activate_only_after ${extensions.delay}\n${content}`
    }
    if (extensions.match_whole_words === true) content = `@@match_full_word\n${content}`
    if (extensions.match_whole_words === false) content = `@@match_partial_word\n${content}`
    return { content, selective }
}

/** A Malang lore entry as the loreBook PocketRisu would have imported. */
export function toRisuLore(entry: LoreEntry, extensions: Record<string, unknown> = {}): RisuLore {
    const converted = cardExtensionDecorators(entry.content, extensions, entry.secondaryKeys)
    const structured = structuredDecorators(entry)
    return {
        key: entry.keys.join(', '),
        secondkey: entry.secondaryKeys.join(', '),
        insertorder: entry.insertionOrder,
        comment: entry.name,
        content: structured.length
            ? `${structured.join('\n')}\n${converted.content}`
            : converted.content,
        mode: entry.isGroup ? 'folder' : 'normal',
        alwaysActive: entry.constant,
        selective: converted.selective ?? entry.selective,
        useRegex: entry.useRegex,
        id: entry.id,
        sourceId: entry.id,
    }
}

function sfc32(a: number, b: number, c: number, d: number) {
    return () => {
        a |= 0
        b |= 0
        c |= 0
        d |= 0
        const t = (((a + b) | 0) + d) | 0
        d = (d + 1) | 0
        a = b ^ (b >>> 9)
        b = (c + (c << 3)) | 0
        c = (c << 21) | (c >>> 11)
        c = (c + t) | 0
        return (t >>> 0) / 4294967296
    }
}

/** util.ts pickHashRand: the fallback id for match-state lore variables. */
function pickHashRand(cid: number, word: string): number {
    let hashAddress = 5515
    const rand = (text: string) => {
        for (let counter = 0; counter < text.length; counter += 1) {
            hashAddress = (hashAddress << 5) + hashAddress + text.charCodeAt(counter)
        }
        return hashAddress
    }
    const randF = sfc32(rand(word), rand(word), rand(word), rand(word))
    for (let index = 0; index < cid % 1000; index += 1) randF()
    return randF()
}

export function loadLoreBookV3Prompt(input: {
    lore: RisuLore[]
    /** chat.message: the stored chat without its greeting. */
    messages: LoreChatMessage[]
    userName: string
    charName: string
    fmIndex: number
    settings: {
        scanDepth?: number
        tokenBudget?: number
        recursiveScanning?: boolean
        fullWordMatching?: boolean
    }
    getChatVar: (key: string) => string
    setChatVar: (key: string, value: string) => void
    parse: (text: string) => string
    countTokens: (text: string) => number
}): { actives: ActiveLore[] } {
    const fullLore = structuredClone(input.lore)
    const currentChat = input.messages
    const loreDepth = input.settings.scanDepth ?? 5
    const loreToken = input.settings.tokenBudget ?? 800
    const fullWordMatchingSetting = input.settings.fullWordMatching ?? false
    const chatLength = currentChat.length + 1
    const recursiveScanning = input.settings.recursiveScanning ?? true
    const recursivePrompt: { prompt: string; source: string; data: string }[] = []

    const searchMatch = (
        messages: LoreChatMessage[],
        arg: {
            keys: string[]
            searchDepth: number
            regex: boolean
            fullWordMatching: boolean
            all?: boolean
            dontSearchWhenRecursive: boolean
        },
    ): boolean => {
        const sliced = messages.slice(messages.length - arg.searchDepth, messages.length)
        arg.keys = arg.keys.map((key) => key.trim()).filter((key) => key.length > 0)
        let mList = sliced
            .map((message) => ({
                prompt: `\x01{{${message.role === 'user' ? input.userName : input.charName}}}:${message.data}\x01`,
                data: message.data,
            }))
            .concat(
                arg.dontSearchWhenRecursive
                    ? []
                    : recursivePrompt.map((message) => ({
                          prompt: message.prompt,
                          data: message.data,
                      })),
            )

        if (arg.regex) {
            for (const mText of mList) {
                for (const regexString of arg.keys) {
                    if (!regexString.startsWith('/')) return false
                    const regexFlag = regexString.split('/').pop()
                    if (regexFlag) {
                        arg.keys[0] = regexString.replace(`/${regexFlag}`, '')
                        try {
                            if (new RegExp(arg.keys[0] ?? '', regexFlag).test(mText.data)) {
                                return true
                            }
                        } catch {
                            return false
                        }
                    }
                }
            }
            return false
        }

        mList = mList.map((message) => ({
            prompt: message.prompt
                .toLocaleLowerCase()
                .replace(/\{\{\/\/(.+?)\}\}/g, '')
                .replace(/\{\{comment:(.+?)\}\}/g, ''),
            data: message.data
                .toLocaleLowerCase()
                .replace(/\{\{\/\/(.+?)\}\}/g, '')
                .replace(/\{\{comment:(.+?)\}\}/g, ''),
        }))

        const allMode = arg.all ?? false
        let allModeMatched = true
        for (const message of mList) {
            let mText = message.data
            if (arg.fullWordMatching) {
                const split = mText.split(' ')
                for (const key of arg.keys) {
                    if (split.includes(key.toLocaleLowerCase())) {
                        if (!allMode) return true
                    } else if (allMode) {
                        allModeMatched = false
                    }
                }
            } else {
                mText = mText.replace(/ /g, '')
                for (const key of arg.keys) {
                    const realKey = key.toLocaleLowerCase().replace(/ /g, '')
                    if (mText.includes(realKey)) {
                        if (!allMode) return true
                    } else if (allMode) {
                        allModeMatched = false
                    }
                }
            }
        }
        return allMode && allModeMatched
    }

    let matching = true
    const actives: ActiveLore[] = []
    const activatedIndexes: number[] = []
    let keepActivateAfterMatch = false
    let dontActivateAfterMatch = false
    while (matching) {
        matching = false
        for (let i = 0; i < fullLore.length; i += 1) {
            const lore = fullLore[i]!
            if (activatedIndexes.includes(i)) continue
            if (!lore.alwaysActive && !lore.key) continue
            let activated = true
            let pos = ''
            let inject: ActiveLore['inject'] = null
            let depth = 0
            let scanDepth = loreDepth
            const order = lore.insertorder
            let priority = lore.insertorder
            let forceState = 'none'
            let role: ActiveLore['role'] = 'system'
            const searchQueries: { keys: string[]; negative: boolean; all?: boolean }[] = []
            let fullWordMatching = fullWordMatchingSetting
            let dontSearchWhenRecursive = false

            if (lore.mode === 'child') {
                activated = false
                for (let j = 0; j < i; j += 1) {
                    const parent = fullLore[j]!
                    if (parent.id === lore.id) {
                        if (!activatedIndexes.includes(j)) {
                            lore.comment = parent.comment
                            lore.content = parent.content
                            lore.alwaysActive = true
                            activated = true
                        }
                        break
                    }
                }
            }
            let itemRecursive: 'global' | boolean = 'global'
            const stateKey = () => lore.id ?? pickHashRand(5555, lore.content).toString()
            const content = CCardLib.decorator.parse(lore.content, (name, arg) => {
                switch (name) {
                    case 'end':
                        pos = 'depth'
                        depth = 0
                        return
                    case 'activate_only_after': {
                        const int = Number.parseInt(arg[0] ?? '')
                        if (Number.isNaN(int)) return false
                        if (chatLength < int) activated = false
                        return
                    }
                    case 'activate_only_every': {
                        const int = Number.parseInt(arg[0] ?? '')
                        if (Number.isNaN(int)) return false
                        if (chatLength % int !== 0) activated = false
                        return
                    }
                    case 'keep_activate_after_match':
                        if (input.getChatVar(`__internal_ka_${stateKey()}`) === 'true') {
                            forceState = 'activate'
                        } else {
                            keepActivateAfterMatch = true
                        }
                        return false
                    case 'dont_activate_after_match':
                        if (input.getChatVar(`__internal_da_${stateKey()}`) === 'true') {
                            forceState = 'deactivate'
                        } else {
                            dontActivateAfterMatch = true
                        }
                        return false
                    case 'depth':
                    case 'reverse_depth': {
                        const int = Number.parseInt(arg[0] ?? '')
                        if (Number.isNaN(int)) return false
                        depth = int
                        pos = name
                        return
                    }
                    case 'instruct_depth':
                    case 'reverse_instruct_depth':
                    case 'instruct_scan_depth':
                        return false
                    case 'role':
                        if (arg[0] === 'user' || arg[0] === 'assistant' || arg[0] === 'system') {
                            role = arg[0]
                            return
                        }
                        return false
                    case 'scan_depth':
                        scanDepth = Number.parseInt(arg[0] ?? '')
                        return
                    case 'is_greeting': {
                        const int = Number.parseInt(arg[0] ?? '')
                        if (Number.isNaN(int)) return false
                        if (input.fmIndex + 1 !== int) activated = false
                        return
                    }
                    case 'position':
                        if (
                            arg[0]?.startsWith('pt_') ||
                            ['after_desc', 'before_desc', 'personality', 'scenario'].includes(
                                arg[0] ?? '',
                            )
                        ) {
                            pos = arg[0] ?? ''
                            return
                        }
                        return false
                    case 'inject_lore':
                        inject ??= { operation: 'append', location: '', param: '', lore: true }
                        inject.location = arg.join(' ')
                        inject.lore = true
                        return
                    case 'inject_at':
                        inject ??= { operation: 'append', location: '', param: '', lore: false }
                        inject.location = arg.join(' ')
                        inject.lore = false
                        return
                    case 'inject_replace':
                        inject ??= { operation: 'replace', location: '', param: '', lore: false }
                        inject.operation = 'replace'
                        inject.param = arg.join(' ')
                        return
                    case 'inject_prepend':
                        inject ??= { operation: 'prepend', location: '', param: '', lore: false }
                        inject.operation = 'prepend'
                        inject.param = arg.join(' ')
                        return
                    case 'ignore_on_max_context':
                        priority = -1000
                        return
                    case 'additional_keys':
                        searchQueries.push({ keys: arg, negative: false })
                        return
                    case 'exclude_keys':
                        searchQueries.push({ keys: arg, negative: true })
                        return
                    case 'exclude_keys_all':
                        searchQueries.push({ keys: arg, negative: true, all: true })
                        return
                    case 'match_full_word':
                        fullWordMatching = true
                        return
                    case 'match_partial_word':
                        fullWordMatching = false
                        return
                    case 'is_user_icon':
                        return false
                    case 'activate':
                        forceState = 'activate'
                        return
                    case 'dont_activate':
                        forceState = 'deactivate'
                        return
                    case 'disable_ui_prompt':
                        return ['post_history_instructions', 'system_prompt'].includes(arg[0] ?? '')
                            ? undefined
                            : false
                    case 'probability':
                        if (Math.random() * 100 > Number.parseInt(arg[0] ?? '')) activated = false
                        return
                    case 'priority':
                        priority = Number.parseInt(arg[0] ?? '')
                        return
                    case 'unrecursive':
                        itemRecursive = false
                        return
                    case 'recursive':
                        itemRecursive = true
                        return
                    case 'no_recursive_search':
                        dontSearchWhenRecursive = true
                        return
                    default:
                        return false
                }
            })

            if (activated && forceState === 'none' && !lore.alwaysActive) {
                searchQueries.push({ keys: lore.key.split(','), negative: false })
                if (lore.secondkey && lore.selective) {
                    searchQueries.push({ keys: lore.secondkey.split(','), negative: false })
                }
                for (const query of searchQueries) {
                    const result = searchMatch(currentChat, {
                        keys: query.keys,
                        searchDepth: scanDepth,
                        regex: lore.useRegex ?? false,
                        fullWordMatching,
                        all: query.all,
                        dontSearchWhenRecursive,
                    })
                    if (query.negative ? result : !result) {
                        activated = false
                        break
                    }
                }
            }

            if (forceState === 'activate') activated = true
            else if (forceState === 'deactivate') activated = false

            if (activated) {
                actives.push({
                    depth,
                    pos,
                    prompt: content,
                    role,
                    order,
                    tokens: input.countTokens(input.parse(content)),
                    priority,
                    source: lore.comment || `lorebook ${i}`,
                    inject,
                    sourceId: lore.sourceId,
                })
                activatedIndexes.push(i)
                if (keepActivateAfterMatch) input.setChatVar(`__internal_ka_${stateKey()}`, 'true')
                if (dontActivateAfterMatch) input.setChatVar(`__internal_da_${stateKey()}`, 'true')

                const recursive = itemRecursive === 'global' ? recursiveScanning : itemRecursive
                if (recursive) {
                    matching = true
                    recursivePrompt.push({
                        prompt: content,
                        data: content,
                        source: lore.comment || `lorebook ${i}`,
                    })
                }
            }
        }
    }

    let usedTokens = 0
    const activesFiltered = actives
        .sort((a, b) => b.priority - a.priority)
        .filter((active) => {
            if (usedTokens + active.tokens <= loreToken) {
                usedTokens += active.tokens
                return true
            }
            return false
        })
    let activesResorted = activesFiltered.sort((a, b) => b.order - a.order)
    const loreInjectionLores = activesResorted.filter((active) => active.inject?.lore)
    activesResorted = activesResorted.filter((active) => !active.inject?.lore)
    for (const lore of loreInjectionLores) {
        const found = activesResorted.find((active) => active.source === lore.inject?.location)
        if (!found || !lore.inject) continue
        if (lore.inject.operation === 'append') found.prompt += ` ${lore.prompt}`
        else if (lore.inject.operation === 'prepend')
            found.prompt = `${lore.prompt} ${found.prompt}`
        else found.prompt = found.prompt.replace(lore.inject.param, lore.prompt)
    }
    return { actives: activesResorted.reverse() }
}

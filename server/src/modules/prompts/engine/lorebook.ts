import type { LoreEntry, Message } from '@malang/shared'
import { RE2JS } from 're2js'

export interface LoreSettings {
    scanDepth?: number
    tokenBudget?: number
    recursiveScanning?: boolean
}

interface LoreInjection {
    lore: true
    location: string
    operation: 'append' | 'prepend' | 'replace'
    param: string
}

export function selectLoreEntries(
    entries: LoreEntry[],
    messages: Message[],
    settings: LoreSettings,
    countTokens: (text: string) => number,
): { entries: LoreEntry[]; warnings: string[] } {
    const warnings: string[] = []
    const depth = Math.max(1, settings.scanDepth || 5)
    let haystack = messages
        .slice(-depth)
        .map((message) => message.content)
        .join('\n')
    const selected = new Map<string, LoreEntry>()
    const rounds = settings.recursiveScanning ? 3 : 1

    for (let round = 0; round < rounds; round += 1) {
        let added = false
        for (const sourceEntry of entries) {
            if (sourceEntry.isGroup) continue
            const entry = normalizeLoreDecorators(sourceEntry, warnings)
            if (!entry.enabled || selected.has(entry.id)) continue
            if (entry.probability < 100 && Math.random() * 100 > entry.probability) continue
            const entryHaystack = entry.scanDepth
                ? messages
                      .slice(-entry.scanDepth)
                      .map((message) => message.content)
                      .join('\n')
                : haystack
            const primary =
                entry.constant ||
                matchesAny([...entry.keys, ...entry.additionalKeys], entryHaystack, entry, warnings)
            const secondary =
                !entry.selective || matchesAny(entry.secondaryKeys, entryHaystack, entry, warnings)
            const excluded = matchesAny(entry.excludeKeys, entryHaystack, entry, warnings)
            if (!primary || !secondary || excluded) continue
            selected.set(entry.id, entry)
            if (entry.recursive !== 'disabled') haystack += `\n${entry.content}`
            added = true
        }
        if (!added) break
    }

    const budget = settings.tokenBudget || 800
    let used = 0
    const result: LoreEntry[] = []
    for (const entry of [...selected.values()].sort(
        (a, b) => b.priority - a.priority || a.insertionOrder - b.insertionOrder,
    )) {
        const cost = countTokens(entry.content)
        if (used + cost > budget) continue
        used += cost
        result.push(entry)
    }
    const injected = applyLoreInjections(result, warnings)
    injected.sort((a, b) => a.insertionOrder - b.insertionOrder)
    return { entries: injected, warnings }
}

function matchesAny(
    keys: string[],
    haystack: string,
    entry: LoreEntry,
    warnings: string[],
): boolean {
    if (!keys.length) return false
    return keys.some((key) => {
        if (!key) return false
        if (!entry.useRegex) {
            const source = entry.caseSensitive ? haystack : haystack.toLocaleLowerCase()
            const needle = entry.caseSensitive ? key : key.toLocaleLowerCase()
            if (!entry.fullWordMatching) return source.includes(needle)
            const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            return new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, entry.caseSensitive ? '' : 'i').test(
                haystack,
            )
        }
        try {
            const flags = entry.caseSensitive ? 0 : RE2JS.CASE_INSENSITIVE
            return RE2JS.compile(key, flags).matcher(haystack).find()
        } catch {
            warnings.push(`Invalid RE2 lorebook pattern in ${entry.name || entry.id}`)
            return false
        }
    })
}

function normalizeLoreDecorators(entry: LoreEntry, warnings: string[]): LoreEntry {
    const next: LoreEntry = {
        ...entry,
        additionalKeys: [...entry.additionalKeys],
        excludeKeys: [...entry.excludeKeys],
        decorators: { ...entry.decorators },
    }
    const retained: string[] = []
    for (const line of entry.content.split(/\r?\n/)) {
        const match = line.match(/^@@([a-z_]+)(?:\s+([\s\S]*))?$/i)
        if (!match) {
            retained.push(line)
            continue
        }
        const name = (match[1] || '').toLocaleLowerCase()
        const argument = (match[2] || '').trim()
        if (name === 'position') next.position = argument
        else if (name === 'depth') {
            next.position = 'depth'
            next.depth = Number.parseInt(argument, 10) || 0
        } else if (name === 'reverse_depth') {
            next.position = 'reverse_depth'
            next.depth = Number.parseInt(argument, 10) || 0
        } else if (name === 'role' && ['system', 'user', 'assistant'].includes(argument)) {
            next.role = argument as LoreEntry['role']
        } else if (name === 'scan_depth')
            next.scanDepth = Number.parseInt(argument, 10) || undefined
        else if (name === 'priority') next.priority = Number.parseInt(argument, 10) || next.priority
        else if (name === 'probability') {
            next.probability = Math.max(0, Math.min(100, Number.parseInt(argument, 10) || 0))
        } else if (name === 'additional_keys')
            next.additionalKeys.push(...splitDecoratorKeys(argument))
        else if (name === 'exclude_keys' || name === 'exclude_keys_all') {
            next.excludeKeys.push(...splitDecoratorKeys(argument))
        } else if (name === 'match_full_word') next.fullWordMatching = true
        else if (name === 'match_partial_word') next.fullWordMatching = false
        else if (name === 'recursive') next.recursive = 'enabled'
        else if (name === 'unrecursive' || name === 'no_recursive_search')
            next.recursive = 'disabled'
        else if (name === 'inject_lore') {
            next.decorators.inject = {
                lore: true,
                location: argument,
                operation: 'append',
                param: '',
            } satisfies LoreInjection
        } else if (name === 'inject_replace' || name === 'inject_prepend') {
            const inject = readLoreInjection(next.decorators.inject) || {
                lore: true,
                location: '',
                operation: 'append',
                param: '',
            }
            next.decorators.inject = {
                ...inject,
                operation: name === 'inject_replace' ? 'replace' : 'prepend',
                param: argument,
            } satisfies LoreInjection
        } else if (name === 'keep_activate_after_match' || name === 'dont_activate_after_match') {
            warnings.push(`Stateful lore decorator @@${name} is preserved but disabled`)
            next.decorators[name] = argument
        } else {
            retained.push(line)
        }
    }
    next.content = retained.join('\n')
    return next
}

function applyLoreInjections(entries: LoreEntry[], warnings: string[]): LoreEntry[] {
    const output = entries
        .filter((entry) => !readLoreInjection(entry.decorators.inject))
        .map((entry) => ({ ...entry, decorators: { ...entry.decorators } }))
    for (const injector of entries) {
        const inject = readLoreInjection(injector.decorators.inject)
        if (!inject) continue
        const target = output.find((entry) => entry.name === inject.location)
        if (!target) {
            warnings.push(
                `Lore injection ${injector.name || injector.id} could not find ${inject.location}`,
            )
            continue
        }
        if (inject.operation === 'append') target.content += ` ${injector.content}`
        else if (inject.operation === 'prepend')
            target.content = `${injector.content} ${target.content}`
        else target.content = target.content.replace(inject.param, injector.content)
    }
    return output
}

function readLoreInjection(value: unknown): LoreInjection | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const source = value as Record<string, unknown>
    const operation = source.operation
    if (
        source.lore !== true ||
        typeof source.location !== 'string' ||
        typeof source.param !== 'string' ||
        (operation !== 'append' && operation !== 'prepend' && operation !== 'replace')
    ) {
        return null
    }
    return {
        lore: true,
        location: source.location,
        operation,
        param: source.param,
    }
}

function splitDecoratorKeys(value: string): string[] {
    return value
        .split(/\s*,\s*|\s*::\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
}

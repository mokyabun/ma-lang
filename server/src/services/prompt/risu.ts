import type {
    BiasEntry,
    LuaScriptInput,
    PromptSettings,
    PromptToggle,
    RegexScript,
} from '@malang/shared'

export function normalizeLuaTriggers(
    value: unknown,
    lowLevelAccess: unknown,
): { luaScript: LuaScriptInput | null; rawTriggers: unknown[]; warnings: string[] } {
    const rawTriggers = Array.isArray(value) ? structuredClone(value) : []
    const lua = rawTriggers.flatMap((trigger) => {
        if (!isRecord(trigger) || !Array.isArray(trigger.effect)) return []
        const effect = trigger.effect[0]
        return isRecord(effect) && effect.type === 'triggerlua' && typeof effect.code === 'string'
            ? [effect.code]
            : []
    })
    return {
        luaScript: lua.length
            ? {
                  code: lua[0] || '',
                  enabled: true,
                  lowLevelAccess: lowLevelAccess === true,
              }
            : null,
        rawTriggers,
        warnings:
            lua.length > 1
                ? [`${lua.length} Lua triggers were preserved; only the first is executed`]
                : [],
    }
}

export function mergeLuaTriggers(
    rawValue: unknown,
    script: Pick<LuaScriptInput, 'code'> | null | undefined,
): unknown[] {
    const raw = Array.isArray(rawValue) ? structuredClone(rawValue) : []
    let replaced = false
    for (const trigger of raw) {
        if (replaced || !isRecord(trigger) || !Array.isArray(trigger.effect)) continue
        const effect = trigger.effect[0]
        if (!isRecord(effect) || effect.type !== 'triggerlua') continue
        if (script) effect.code = script.code
        else trigger.effect = trigger.effect.slice(1)
        replaced = true
    }
    if (script && !replaced) {
        raw.unshift({
            comment: 'Lua Script',
            type: 'manual',
            conditions: [],
            effect: [{ type: 'triggerlua', code: script.code }],
        })
    }
    return raw
}

export function parseKeyValueVariables(value: unknown): Record<string, string> {
    if (typeof value !== 'string') return {}
    const result: Record<string, string> = {}
    for (const line of value.split(/\r?\n/)) {
        const separator = line.indexOf('=')
        if (separator < 1) continue
        result[line.slice(0, separator).trim()] = line.slice(separator + 1)
    }
    return result
}

export function serializeKeyValueVariables(value: Record<string, string>): string {
    return Object.entries(value)
        .map(([key, item]) => `${key}=${item}`)
        .join('\n')
}

export const defaultPromptSettings: PromptSettings = {
    assistantPrefill: '',
    postEndInnerFormat: '',
    sendChatAsSystem: false,
    sendName: false,
    trimStartNewChat: false,
    groupTemplate: '',
}

export function normalizeRegexScripts(value: unknown): RegexScript[] {
    if (!Array.isArray(value)) return []
    return value.slice(0, 2_000).flatMap((item, index) => {
        if (!isRecord(item)) return []
        const rawType = stringValue(item.type)
        const phase = isRegexPhase(rawType) ? rawType : 'editdisplay'
        const enabled = rawType !== 'disabled' && item.enabled !== false
        return [
            {
                id: stringValue(item.id) || crypto.randomUUID(),
                comment: stringValue(item.comment) || `Regex ${index + 1}`,
                pattern: stringValue(item.in ?? item.pattern),
                replacement: stringValue(item.out ?? item.replacement),
                phase,
                enabled,
                flags: item.ableFlag === false ? '' : stringValue(item.flag ?? item.flags),
                disabledReason: enabled
                    ? undefined
                    : rawType === 'disabled'
                      ? 'Disabled in RisuAI source'
                      : 'Disabled by source',
                raw: item,
            },
        ]
    })
}

export function toRisuRegexScripts(
    scripts: Array<
        Pick<RegexScript, 'id' | 'pattern' | 'replacement' | 'phase'> &
            Partial<Pick<RegexScript, 'comment' | 'enabled' | 'flags'>>
    >,
) {
    return scripts.map((script) => ({
        comment: script.comment || '',
        in: script.pattern,
        out: script.replacement,
        type: script.enabled === false ? 'disabled' : script.phase,
        flag: script.flags || '',
        ableFlag: !!script.flags,
    }))
}

export function parsePromptToggles(value: unknown): PromptToggle[] {
    if (typeof value !== 'string') return []
    const result: PromptToggle[] = []
    for (const line of value.split(/\r?\n/)) {
        if (!line.trim()) continue
        const [key = '', label = '', rawType = '', option = ''] = line.split('=')
        const type = toggleType(rawType)
        if (!type) continue
        const layout = ['group', 'groupEnd', 'divider', 'caption'].includes(type)
        if (!layout && (!key.trim() || !label.trim())) continue
        result.push({
            key: key.trim(),
            label: label.trim(),
            type,
            options: type === 'select' ? option.split(',').map((item) => item.trim()) : [],
            defaultValue: type === 'boolean' ? '0' : type === 'select' ? '0' : '',
        })
    }
    return result.slice(0, 1_000)
}

export function serializePromptToggles(
    toggles: Array<Pick<PromptToggle, 'type'> & Partial<Omit<PromptToggle, 'type'>>>,
): string {
    return toggles
        .map((toggle) => {
            const type = toggle.type === 'boolean' ? '' : toggle.type
            const options = toggle.type === 'select' ? (toggle.options || []).join(',') : ''
            return [toggle.key || '', toggle.label || '', type, options]
                .join('=')
                .replace(/=+$/, '')
        })
        .join('\n')
}

export function parseModuleIntegrations(value: unknown): string[] {
    return typeof value === 'string'
        ? [
              ...new Set(
                  value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
              ),
          ]
        : []
}

export function parseBiasEntries(value: unknown): BiasEntry[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((entry): BiasEntry[] =>
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1])
            ? [[entry[0], entry[1]]]
            : [],
    )
}

export function normalizePromptSettings(value: unknown): PromptSettings {
    if (!isRecord(value)) return defaultPromptSettings
    return {
        assistantPrefill: stringValue(value.assistantPrefill),
        postEndInnerFormat: stringValue(value.postEndInnerFormat),
        sendChatAsSystem: value.sendChatAsSystem === true,
        sendName: value.sendName === true,
        trimStartNewChat: value.trimStartNewChat === true,
        groupTemplate: stringValue(value.groupTemplate),
    }
}

export function record(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {}
}

export function stringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
}

function toggleType(value: string): PromptToggle['type'] | null {
    if (!value || value === 'boolean' || value === 'toggle') return 'boolean'
    if (
        value === 'select' ||
        value === 'text' ||
        value === 'textarea' ||
        value === 'group' ||
        value === 'groupEnd' ||
        value === 'divider' ||
        value === 'caption'
    ) {
        return value
    }
    return null
}

function isRegexPhase(value: string): value is RegexScript['phase'] {
    return (
        value === 'editinput' ||
        value === 'editprocess' ||
        value === 'editoutput' ||
        value === 'editdisplay'
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

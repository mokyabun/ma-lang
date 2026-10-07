export interface TemplateContext {
    values: Record<string, string>
    variables: Record<string, string>
    globalVariables: Record<string, string>
    toggles: Record<string, boolean>
    // Raw toggle values for `#when::tis`/`tisnot`; select/text toggles aren't on/off.
    toggleValues?: Record<string, string>
    messages?: Array<{
        role: string
        content: string
        createdAt?: string | number
    }>
    modelId?: string
    maxContextTokens?: number
    moduleNamespaces?: string[]
    assets?: Array<{
        name: string
        url: string
        type?: string
        extension?: string
        mimeType?: string
        moduleNamespace?: string
    }>
    /** Resolve PocketRisu media CBS commands to safe display markup instead of a bare URL. */
    assetRenderMode?: 'url' | 'display'
    /** Opt into PocketRisu's risuChatParser semantics for chat variables and legacy tags. */
    pocketRisu?: PocketRisuParserOptions
}

export interface PocketRisuParserOptions {
    /** setvar/addvar/setdefaultvar: `run` executes, `remove` drops, `keep` leaves them as text. */
    variableMode: 'run' | 'remove' | 'keep'
    /** Character, then preset default variables, consulted by getvar before `null`. */
    variableDefaults: Record<string, string>
    /** risuChatParser's chatID: the stored message being processed, or -1. */
    chatId: number
    /** The `role` argument risuChatParser was called with. */
    role?: string
    /** The chat's selected greeting, the fallback of previouscharchat/previoususerchat. */
    greeting: string
    /** Nesting of value re-parses; risuChatParser stops at 20. */
    callStack?: number
    /** risuChatParser's `visualize`: chat display renders {{comment}} and {{file}} as markup. */
    displaying?: boolean
}

/** CBS values PocketRisu runs through risuChatParser again when they are read. */
const reparsedValues = new Set([
    'description',
    'chardesc',
    'personality',
    'charpersona',
    'scenario',
    'persona',
    'userpersona',
    'exampledialogue',
    'examplemessage',
    'authornote',
    'globalnote',
    'mainprompt',
    'systemprompt',
    'jb',
])

export interface TemplateResult {
    text: string
    warnings: string[]
    /** Chat variables after the render, including any setvar/addvar it ran. */
    variables: Record<string, string>
}

interface Limits {
    maxDepth: number
    maxNodes: number
    maxOutputLength: number
}

type BlockKind =
    | 'if'
    | 'ifPure'
    | 'when'
    | 'each'
    | 'pure'
    | 'pureDisplay'
    | 'escape'
    | 'code'
    | 'function'

type TemplateSlots = Record<string, string>

interface TemplateRuntimeState {
    variables: Record<string, string>
    temporaryVariables: Record<string, string>
    functions: Map<string, { body: string; arguments: string[] }>
}

const defaultLimits: Limits = { maxDepth: 128, maxNodes: 10_000, maxOutputLength: 1024 * 1024 }

export function renderTemplate(
    source: string,
    context: TemplateContext,
    limits: Limits = defaultLimits,
): TemplateResult {
    const warnings: string[] = []
    const runtime: TemplateRuntimeState = {
        variables: { ...context.variables },
        temporaryVariables: {},
        functions: new Map(),
    }
    let nodes = 0
    // risuChatParser rewrites legacy name tags before parsing anything else.
    if (context.pocketRisu) source = source.replace(/<(user|char|bot)>/gi, '{{$1}}')

    function renderRange(input: string, depth: number, slots: TemplateSlots = {}): string {
        if (depth > limits.maxDepth) throw new Error('Template nesting limit exceeded')
        let output = ''
        let cursor = 0

        while (cursor < input.length) {
            nodes += 1
            if (nodes > limits.maxNodes) throw new Error('Template node limit exceeded')
            const start = input.indexOf('{{#', cursor)
            if (start === -1) {
                output += input.slice(cursor)
                break
            }
            output += input.slice(cursor, start)
            const headerEnd = findTagEnd(input, start)
            if (headerEnd === -1) {
                output += input.slice(start)
                break
            }
            const rawHeader = input.slice(start + 2, headerEnd).trim()
            const kind = blockKind(rawHeader)
            if (!kind) {
                output += input.slice(start, headerEnd + 2)
                cursor = headerEnd + 2
                continue
            }
            const match = findClosing(input, headerEnd + 2)
            if (!match) {
                warnings.push(`Unclosed template block: ${rawHeader}`)
                output += input.slice(start, headerEnd + 2)
                cursor = headerEnd + 2
                continue
            }
            const header = expandVariables(rawHeader, context, warnings, slots, runtime)
            const body = input.slice(headerEnd + 2, match.closeStart)
            if (kind === 'function') {
                const [name, ...functionArguments] = header.slice(5).trim().split(/\s+/)
                if (name)
                    runtime.functions.set(name, {
                        body: body.trim(),
                        arguments: functionArguments,
                    })
            } else if (kind === 'each') {
                const spec = eachSpec(header)
                if (!spec) {
                    warnings.push(`Invalid #each expression: ${header}`)
                } else {
                    const prepared = spec.keep ? body : trimLines(body.trim())
                    const items = parseRisuArray(spec.source)
                    let added = ''
                    for (const item of items) {
                        const value = typeof item === 'string' ? item : JSON.stringify(item)
                        added += renderRange(prepared, depth + 1, { ...slots, [spec.slot]: value })
                    }
                    output += spec.keep ? added : added.trim()
                }
            } else if (kind === 'pure' || kind === 'pureDisplay' || kind === 'escape') {
                const keep = kind === 'escape' && header.slice(7).trim() === '::keep'
                const literal = keep ? body : body.trim()
                output += escapeRisuLiteral(literal)
            } else if (kind === 'code') {
                output += normalizeCode(renderRange(body, depth + 1, slots))
            } else {
                // PocketRisu's #if blocks have no else branch; `{{:else}}` stays literal.
                const split =
                    context.pocketRisu && (kind === 'if' || kind === 'ifPure')
                        ? { truthy: body, falsy: '' }
                        : splitElse(body)
                const truthy =
                    kind === 'when'
                        ? evaluateWhen(header.slice(5), context, runtime)
                        : isRisuTruthy(
                              header
                                  .slice(kind === 'ifPure' ? 8 : 3)
                                  .trim()
                                  .replace(/[{}]/g, ''),
                          )
                const selected = truthy ? split.truthy : split.falsy
                const prepared =
                    kind === 'ifPure'
                        ? selected
                        : kind === 'if'
                          ? trimLines(selected.trim())
                          : trimWhenBlock(selected, header)
                output += renderRange(prepared, depth + 1, slots)
            }
            cursor = match.closeEnd
            if (output.length > limits.maxOutputLength)
                throw new Error('Template output limit exceeded')
        }
        return expandVariables(output, context, warnings, slots, runtime)
    }

    const blocked = renderRange(source, 0)
    let expanded = expandVariables(blocked, context, warnings, {}, runtime)
        // Drop stray close markers left by Risu/CBS exports.
        .replace(/\{\{\/(?!\/)[^{}]*}}/g, '')
    if (!context.pocketRisu) expanded = expanded.replaceAll('{{:else}}', '')
    const text = unescapeRisuLiteral(expanded)
    if (text.length > limits.maxOutputLength) throw new Error('Template output limit exceeded')
    return { text, warnings: [...new Set(warnings)], variables: runtime.variables }
}

/** getChatVar: the chat's own value, then default variables, then the literal `null`. */
function chatVariable(
    key: string,
    context: TemplateContext,
    runtime: TemplateRuntimeState,
): string | undefined {
    const value = runtime.variables[key]
    if (value !== undefined && value !== null) return value
    if (!context.pocketRisu) return undefined
    return context.pocketRisu.variableDefaults[key] ?? 'null'
}

function blockKind(token: string): BlockKind | null {
    if (token === '#if_pure' || token.startsWith('#if_pure ')) return 'ifPure'
    if (token === '#if' || token.startsWith('#if ')) return 'if'
    if (token === '#when' || token.startsWith('#when::') || token.startsWith('#when '))
        return 'when'
    if (token === '#each' || token.startsWith('#each ') || token.startsWith('#each::'))
        return 'each'
    if (token === '#pure') return 'pure'
    if (token === '#pure_display' || token === '#puredisplay') return 'pureDisplay'
    if (token === '#escape' || token.startsWith('#escape::')) return 'escape'
    if (token === '#code') return 'code'
    if (token.startsWith('#func ')) return 'function'
    return null
}

function isConditionalEnd(token: string): boolean {
    return token.startsWith('/') && !token.startsWith('//')
}

function findClosing(input: string, from: number) {
    let cursor = from
    let depth = 1
    while (cursor < input.length) {
        const start = input.indexOf('{{', cursor)
        if (start === -1) return null
        const end = findTagEnd(input, start)
        if (end === -1) return null
        const token = input.slice(start + 2, end).trim()
        if (blockKind(token)) depth += 1
        else if (isConditionalEnd(token)) {
            depth -= 1
            if (depth === 0) {
                return { closeStart: start, closeEnd: end + 2 }
            }
        }
        cursor = end + 2
    }
    return null
}

function splitElse(body: string): { truthy: string; falsy: string } {
    let depth = 0
    for (let cursor = 0; cursor < body.length;) {
        const next = body.indexOf('{{', cursor)
        if (next === -1) break
        const end = findTagEnd(body, next)
        if (end === -1) break
        const token = body.slice(next + 2, end).trim()
        if (blockKind(token)) depth += 1
        else if (isConditionalEnd(token)) depth -= 1
        else if (token === ':else' && depth === 0) {
            return { truthy: body.slice(0, next), falsy: body.slice(end + 2) }
        }
        cursor = end + 2
    }
    return { truthy: body, falsy: '' }
}

function eachSpec(header: string): { source: string; slot: string; keep: boolean } | null {
    let expression = header.slice(5).trim()
    let keep = false
    if (expression.startsWith('::keep ')) {
        keep = true
        expression = expression.slice(7).trim()
    }
    let separator = expression.lastIndexOf(' as ')
    let separatorLength = 4
    if (separator === -1) {
        separator = expression.lastIndexOf(' ')
        separatorLength = 1
    }
    if (separator === -1) return null
    const source = expression.slice(0, separator).trim()
    const slot = expression.slice(separator + separatorLength).trim()
    return source && slot ? { source, slot, keep } : null
}

function parseRisuArray(source: string): unknown[] {
    try {
        const value: unknown = JSON.parse(source)
        return Array.isArray(value) ? value : source.split('§')
    } catch {
        return source.split('§')
    }
}

function trimLines(source: string): string {
    return source
        .split('\n')
        .map((line) => line.trimStart())
        .join('\n')
        .trim()
}

function trimWhenBlock(source: string, header: string): string {
    if (header.startsWith('#when::keep::')) return source
    if (header.startsWith('#when::legacy::')) return trimLines(source.trim())
    if (!source.includes('\n')) return source
    return source.replace(/^\n+|\n+$/g, '')
}

function normalizeCode(source: string): string {
    return source
        .trim()
        .replaceAll('\n', '')
        .replaceAll('\t', '')
        .replace(/\\u([0-9A-Fa-f]{4})/g, (_match, code: string) =>
            String.fromCharCode(Number.parseInt(code, 16)),
        )
        .replace(/\\(.)/g, (_match, character: string) => {
            const escapes: Record<string, string> = {
                n: '\n',
                r: '\r',
                t: '\t',
                b: '\b',
                f: '\f',
                v: '\v',
                a: '\u0007',
                x: '\0',
            }
            return escapes[character] ?? character
        })
}

function escapeRisuLiteral(source: string): string {
    return source.replace(/[{}()<>:;]/g, (character) => {
        const index = '{}()<>:;'.indexOf(character)
        return String.fromCharCode(0xe9b8 + index)
    })
}

function unescapeRisuLiteral(source: string): string {
    return source.replace(/[\uE9B8-\uE9BF]/g, (character) => {
        const replacements = ['{', '}', '(', ')', '<', '>', ':', ';']
        return replacements[character.charCodeAt(0) - 0xe9b8] || character
    })
}

function findTagEnd(input: string, start: number): number {
    let depth = 1
    for (let cursor = start + 2; cursor < input.length - 1;) {
        if (input.startsWith('{{', cursor)) {
            depth += 1
            cursor += 2
            continue
        }
        if (input.startsWith('}}', cursor)) {
            depth -= 1
            if (depth === 0) return cursor
            cursor += 2
            continue
        }
        cursor += 1
    }
    return -1
}

function expandVariables(
    source: string,
    context: TemplateContext,
    warnings: string[],
    slots: TemplateSlots = {},
    runtime: TemplateRuntimeState = {
        variables: { ...context.variables },
        temporaryVariables: {},
        functions: new Map(),
    },
): string {
    let result = source
    for (let pass = 0; pass < 512; pass += 1) {
        const next = expandVariablesOnce(result, context, warnings, slots, runtime)
        if (next === result) return next
        result = next
    }
    return result
}

function expandVariablesOnce(
    source: string,
    context: TemplateContext,
    warnings: string[],
    slots: TemplateSlots,
    runtime: TemplateRuntimeState,
): string {
    const stack: number[] = []
    for (let cursor = 0; cursor < source.length - 1; cursor += 1) {
        if (source.startsWith('{{', cursor)) {
            stack.push(cursor)
            cursor += 1
            continue
        }
        if (!source.startsWith('}}', cursor) || !stack.length) continue
        const start = stack.pop()!
        const expression = source.slice(start + 2, cursor)
        const evaluated = evaluateCbsExpression(expression, context, warnings, slots, runtime)
        if (evaluated !== null) return source.slice(0, start) + evaluated + source.slice(cursor + 2)
        cursor += 1
    }
    return source
}

function evaluateCbsExpression(
    expression: string,
    context: TemplateContext,
    warnings: string[],
    slots: TemplateSlots,
    runtime: TemplateRuntimeState,
): string | null {
    const trimmed = expression.trim()
    if (trimmed.startsWith('? ')) return calculateExpression(trimmed.slice(2), runtime, context)

    const separator = trimmed.includes('::') ? '::' : ':'
    const [rawName = '', ...args] = trimmed.split(separator)
    const name = normalizeName(rawName)
    const arg = (index: number) => args[index] ?? ''
    const messages = context.messages || []

    if (name === 'slot') return slots[args.join(separator)] ?? context.values.slot ?? ''
    if (name === 'arg') return slots[`__arg_${arg(0)}`] ?? ''
    if (name === 'call') {
        const registered = runtime.functions.get(arg(0))
        if (!registered) return null
        let body = registered.body
        for (let index = 0; index < args.length - 1; index += 1)
            body = body.replaceAll(`{{arg::${index}}}`, args[index + 1] || '')
        for (const [index, argumentName] of registered.arguments.entries())
            body = body.replaceAll(`{{arg::${argumentName}}}`, args[index + 1] || '')
        return body
    }
    if (name === 'getvar') return chatVariable(args.join(separator), context, runtime) ?? ''
    if (name === 'getglobalvar')
        return context.globalVariables[args.join(separator)] ?? (context.pocketRisu ? 'null' : '')
    if (name === 'tempvar' || name === 'gettempvar')
        return runtime.temporaryVariables[args.join(separator)] ?? ''
    if (name === 'settempvar') {
        runtime.temporaryVariables[arg(0)] = args.slice(1).join(separator)
        return ''
    }
    if (name === 'return') return args.join(separator)
    if (name === 'setvar' || name === 'setdefaultvar' || name === 'addvar') {
        const mode = context.pocketRisu?.variableMode ?? 'run'
        if (mode === 'remove') return ''
        if (mode === 'keep') return null
    }
    if (name === 'setvar') {
        runtime.variables[arg(0)] = args.slice(1).join(separator)
        return ''
    }
    if (name === 'setdefaultvar') {
        const current = chatVariable(arg(0), context, runtime)
        if (!current || current === 'null')
            runtime.variables[arg(0)] = args.slice(1).join(separator)
        return ''
    }
    if (name === 'addvar') {
        // PocketRisu adds to getChatVar's result, so a missing variable reads as `null` (NaN).
        const current = context.pocketRisu
            ? Number(chatVariable(arg(0), context, runtime))
            : Number(runtime.variables[arg(0)] || 0)
        runtime.variables[arg(0)] = String(current + Number(arg(1)))
        return ''
    }
    if (name === 'toggle') {
        const key = args.join(separator)
        if (!Object.hasOwn(context.toggles, key)) warnings.push(`Undeclared prompt toggle: ${key}`)
        return context.toggles[key] ? '1' : '0'
    }
    if (name === 'calc') return calculateExpression(args.join(separator), runtime, context)

    if (name === 'equal') return arg(0) === arg(1) ? '1' : '0'
    if (name === 'notequal') return arg(0) !== arg(1) ? '1' : '0'
    if (name === 'greater') return compareNumber(arg(0), arg(1), '>')
    if (name === 'less') return compareNumber(arg(0), arg(1), '<')
    if (name === 'greaterequal') return compareNumber(arg(0), arg(1), '>=')
    if (name === 'lessequal') return compareNumber(arg(0), arg(1), '<=')
    if (name === 'and') return arg(0) === '1' && arg(1) === '1' ? '1' : '0'
    if (name === 'or') return arg(0) === '1' || arg(1) === '1' ? '1' : '0'
    if (name === 'not') return arg(0) === '1' ? '0' : '1'
    if (name === 'all' || name === 'any') {
        const values = args.length > 1 ? args : parseRisuArray(arg(0)).map(stringifyCbsValue)
        return (
            name === 'all'
                ? values.every((value) => value === '1')
                : values.some((value) => value === '1')
        )
            ? '1'
            : '0'
    }

    if (name === 'startswith') return arg(0).startsWith(arg(1)) ? '1' : '0'
    if (name === 'endswith') return arg(0).endsWith(arg(1)) ? '1' : '0'
    if (name === 'contains') return arg(0).includes(arg(1)) ? '1' : '0'
    if (name === 'replace') return arg(0).replaceAll(arg(1), args.slice(2).join(separator))
    if (name === 'split') return makeRisuArray(arg(0).split(arg(1)))
    if (name === 'join') return parseRisuArray(arg(0)).join(arg(1))
    if (name === 'spread') return parseRisuArray(arg(0)).join('::')
    if (name === 'trim') return args.join(separator).trim()
    if (name === 'length') return String(args.join(separator).length)
    if (name === 'arraylength') return String(parseRisuArray(arg(0)).length)
    if (name === 'upper' || name === 'uppercase') return args.join(separator).toLocaleUpperCase()
    if (name === 'lower' || name === 'lowercase') return args.join(separator).toLocaleLowerCase()
    if (name === 'capitalize') return arg(0).charAt(0).toUpperCase() + arg(0).slice(1)
    if (name === 'reverse') return Array.from(arg(0)).reverse().join('')
    if (name === 'substring') {
        const start = Number.parseInt(arg(1) || '0', 10)
        const end = args[2] === undefined ? undefined : Number.parseInt(arg(2), 10)
        return arg(0).slice(
            Number.isFinite(start) ? start : 0,
            Number.isFinite(end) ? end : undefined,
        )
    }
    if (name === 'tonumber')
        return Array.from(arg(0))
            .filter((value) => !Number.isNaN(Number(value)) || value === '.')
            .join('')
    if (name === 'file') {
        if (context.pocketRisu?.displaying) return `<br><div class="risu-file">${arg(0)}</div><br>`
        try {
            return Buffer.from(arg(1), 'base64').toString('utf8')
        } catch {
            return ''
        }
    }

    if (name === 'round') return String(Math.round(Number(arg(0))))
    if (name === 'floor') return String(Math.floor(Number(arg(0))))
    if (name === 'ceil') return String(Math.ceil(Number(arg(0))))
    if (name === 'abs') return String(Math.abs(Number(arg(0))))
    if (name === 'remaind') return String(Number(arg(0)) % Number(arg(1)))
    if (name === 'pow') return String(Number(arg(0)) ** Number(arg(1)))
    if (name === 'fixnum' || name === 'fixnumber') return Number(arg(0)).toFixed(Number(arg(1)))
    if (['min', 'max', 'sum', 'average'].includes(name)) {
        const values = (args.length > 1 ? args : parseRisuArray(arg(0)).map(stringifyCbsValue)).map(
            (value) => {
                const parsed = Number(value)
                return Number.isNaN(parsed) ? 0 : parsed
            },
        )
        if (name === 'min') return String(Math.min(...values))
        if (name === 'max') return String(Math.max(...values))
        const sum = values.reduce((left, right) => left + right, 0)
        return name === 'average' ? String(sum / values.length) : String(sum)
    }

    if (name === 'makearray' || name === 'array' || name === 'a') return makeRisuArray(args)
    if (['makedict', 'dict', 'd', 'makeobject', 'object', 'o'].includes(name)) {
        const result: Record<string, string> = {}
        for (const value of args) {
            const equal = value.indexOf('=')
            if (equal !== -1) result[value.slice(0, equal)] = value.slice(equal + 1)
        }
        return JSON.stringify(result)
    }
    if (name === 'arrayelement')
        return stringifyCbsValue(parseRisuArray(arg(0)).at(Number(arg(1))) ?? 'null')
    if (name === 'dictelement' || name === 'objectelement')
        return stringifyCbsValue(parseRisuDict(arg(0))[arg(1)] ?? 'null')
    if (name === 'element' || name === 'ele') return nestedElement(args)
    if (
        name === 'arrayshift' ||
        name === 'arraypop' ||
        name === 'arraypush' ||
        name === 'arraysplice' ||
        name === 'arrayassert'
    )
        return mutateArray(name, args)
    if (name === 'objectassert' || name === 'dictassert') {
        const value = parseRisuDict(arg(0))
        if (!value[arg(1)]) value[arg(1)] = arg(2)
        return JSON.stringify(value)
    }
    if (name === 'range') return makeRange(arg(0))
    if (name === 'filter') return filterArray(arg(0), arg(1))

    if (name === 'lastmessage') return messages.at(-1)?.content ?? context.values.lastmessage ?? ''
    if (name === 'lastmessageid' || name === 'lastmessageindex') return String(messages.length - 1)
    if (name === 'previouschatlog') return messages[Number(arg(0))]?.content ?? 'Out of range'
    const risu = context.pocketRisu
    if (risu && (name === 'previouscharchat' || name === 'lastcharmessage')) {
        const from = risu.chatId !== -1 ? risu.chatId - 1 : messages.length - 1
        for (let pointer = from; pointer >= 0; pointer -= 1) {
            if (messages[pointer]?.role === 'assistant') return messages[pointer]!.content
        }
        return risu.greeting
    }
    if (risu && (name === 'previoususerchat' || name === 'lastusermessage')) {
        if (risu.chatId === -1) return ''
        for (let pointer = risu.chatId - 1; pointer >= 0; pointer -= 1) {
            if (messages[pointer]?.role === 'user') return messages[pointer]!.content
        }
        return risu.greeting
    }
    if (risu && name === 'role') {
        if (risu.chatId !== -1) {
            const role = messages[risu.chatId]?.role
            if (role) return role === 'assistant' ? 'char' : role
        }
        return risu.role ?? 'null'
    }
    if (name === 'previouscharchat' || name === 'lastcharmessage')
        return (
            [...messages].reverse().find((message) => message.role === 'assistant')?.content ??
            context.values.lastcharmessage ??
            ''
        )
    if (name === 'previoususerchat' || name === 'lastusermessage')
        return [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
    if (name === 'chatindex') return String(messages.length - 1)
    if (name === 'triggerid') return context.values.trigger_id ?? context.values.triggerid ?? ''
    if (name === 'firstmsgindex' || name === 'firstmessageindex') return '-1'
    if (name === 'role') return risuRole(messages.at(-1)?.role)
    if (name === 'isfirstmsg') return messages.length === 0 ? '1' : '0'
    if (name === 'history' || name === 'messages') return historyValue(messages, args)
    if (name === 'userhistory' || name === 'usermessages') return roleHistory(messages, 'user')
    if (name === 'charhistory' || name === 'charmessages') return roleHistory(messages, 'assistant')
    if (name === 'messagetime') return messageDateValue(messages.at(-1), true)
    if (name === 'messagedate') return messageDateValue(messages.at(-1), false)
    if (name === 'messageunixtimearray')
        return makeRisuArray(
            messages.map((message) => String(new Date(message.createdAt || 0).getTime() / 1000)),
        )
    if (name === 'idleduration' || name === 'messageidleduration')
        return idleDuration(messages, name === 'messageidleduration')

    if (name === 'model' || name === 'axmodel') return context.modelId ?? ''
    if (name === 'maxcontext') return String(context.maxContextTokens ?? '')
    if (name === 'prefillsupported' || name === 'prefill')
        return context.values.prefill_supported === 'true' ? '1' : '0'
    if (name === 'moduleenabled') return context.moduleNamespaces?.includes(arg(0)) ? '1' : '0'
    if (name === 'moduleassetlist')
        return makeRisuArray(
            (context.assets || [])
                .filter((asset) => asset.moduleNamespace === arg(0))
                .map((asset) => asset.name),
        )
    if (name === 'assetlist' || name === 'emotionlist') {
        const type = name === 'emotionlist' ? 'emotion' : undefined
        return makeRisuArray(
            (context.assets || [])
                .filter((asset) => !type || asset.type === type)
                .map((asset) => asset.name),
        )
    }
    if (name === 'chardisplayasset')
        return makeRisuArray((context.assets || []).map((asset) => asset.name))
    if (
        [
            'asset',
            'raw',
            'path',
            'image',
            'img',
            'emotion',
            'audio',
            'video',
            'videoimg',
            'bg',
            'bgm',
            'inlay',
            'inlayed',
            'inlayeddata',
            'source',
        ].includes(name)
    ) {
        // PocketRisu registers inlays as doc-only CBS: the display renderer resolves them.
        if (context.pocketRisu && name.startsWith('inlay')) return null
        const asset = (context.assets || []).find(
            (item) => normalizeName(item.name) === normalizeName(arg(0)),
        )
        if (!asset) return ''
        return context.assetRenderMode === 'display' ? renderDisplayAsset(name, asset) : asset.url
    }

    if (name === 'random' || name === 'pick')
        return randomValue(
            args,
            name === 'pick'
                ? deterministicRandom(args.join('::') + messages.length)
                : Math.random(),
        )
    if (name === 'roll' || name === 'rollp' || name === 'dice')
        return rollDice(
            arg(0),
            name === 'rollp' ? deterministicRandom(arg(0) + messages.length) : Math.random(),
        )
    if (name === 'randint')
        return String(
            Math.floor(Math.random() * (Number(arg(1)) - Number(arg(0)) + 1)) + Number(arg(0)),
        )
    if (name === 'hash')
        return String(Math.floor(deterministicRandom(arg(0)) * 10_000_000) + 1).padStart(7, '0')
    if (name === 'fromhex') return String(Number.parseInt(arg(0), 16))
    if (name === 'tohex') return Number.parseInt(arg(0), 10).toString(16)
    if (name === 'unicodeencode') return String(arg(0).charCodeAt(Number(arg(1) || 0)))
    if (name === 'unicodedecode') return String.fromCharCode(Number(arg(0)))
    if (name === 'u' || name === 'ue') return String.fromCharCode(Number.parseInt(arg(0), 16))
    if (name === 'iserror') return arg(0).toLocaleLowerCase().startsWith('error:') ? '1' : '0'
    if (name === 'xor') return xorValue(arg(0), false)
    if (name === 'xordecrypt') return xorValue(arg(0), true)
    if (name === 'crypt') return cryptValue(arg(0), arg(1))

    if (name === 'date' || name === 'datetimeformat') return formatDate(args, false)
    if (name === 'time') return formatDate(args, true)
    if (name === 'unixtime') return String(Math.floor(Date.now() / 1000))
    if (name === 'isotime') return new Date().toISOString()
    if (name === 'isodate') return new Date().toISOString().slice(0, 10)
    if (name === 'br') return '\n'
    if (name === 'cbr') return '\\n'

    if (name === 'comment' && context.pocketRisu?.displaying)
        return `<div class="risu-comment">${arg(0)}</div>`
    if (
        name === 'blank' ||
        name === 'none' ||
        name === 'hiddenkey' ||
        name === 'comment' ||
        name === 'declare' ||
        name === '//'
    )
        return ''
    if (name === 'jbtoggled') return context.values.jbtoggled ?? '0'
    if (name === 'screenwidth' || name === 'screenheight') return '0'
    if (name === 'bo' || name === 'ddecbo') return '\uE9B8\uE9B8'
    if (name === 'bc' || name === 'ddecbc') return '\uE9B9\uE9B9'
    if (name === 'decbo') return '\uE9B8'
    if (name === 'decbc') return '\uE9B9'
    if (name === 'displayescapedbracketopen' || name === 'debo') return '\uE9BA'
    if (name === 'displayescapedbracketclose' || name === 'debc') return '\uE9BB'
    if (name === 'displayescapedanglebracketopen' || name === 'deabo') return '\uE9BC'
    if (name === 'displayescapedanglebracketclose' || name === 'deabc') return '\uE9BD'
    if (name === 'displayescapedcolon' || name === 'dec') return '\uE9BE'
    if (name === 'displayescapedsemicolon') return '\uE9BF'
    if (name === 'tex' || name === 'latex' || name === 'katex') return `$$${arg(0)}$$`
    if (name === 'ruby' || name === 'furigana')
        return `<ruby>${arg(0)}<rp> (</rp><rt>${arg(1)}</rt><rp>) </rp></ruby>`
    if (name === 'metadata') return metadataValue(arg(0), context)
    if (name === 'button')
        return `<button class="button-default" risu-trigger="${escapeHtml(arg(1))}">${escapeHtml(arg(0))}</button>`
    if (name === 'risu') return ''
    if (name === 'codeblock') {
        const code = escapeHtml(args.at(-1) || '')
        return args.length > 1
            ? `<pre><code class="language-${escapeHtml(arg(0))}">${code}</code></pre>`
            : `<pre><code>${code}</code></pre>`
    }

    const direct = recordValue(context.values, name)
    if (direct !== undefined && risu && reparsedValues.has(name)) {
        const callStack = (risu.callStack ?? 0) + 1
        if (callStack > 20) return 'ERROR: Call stack limit reached'
        const nested = renderTemplate(direct, {
            ...context,
            variables: runtime.variables,
            pocketRisu: { ...risu, callStack },
        })
        warnings.push(...nested.warnings)
        return nested.text
    }
    if (direct !== undefined) return direct
    if (name.startsWith('#') || name.startsWith('/') || name === 'else') return null
    warnings.push(`Unsupported template expression: ${expression}`)
    return null
}

function normalizeName(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase()
        .replace(/[\s_-]/g, '')
}

function renderDisplayAsset(
    command: string,
    asset: NonNullable<TemplateContext['assets']>[number],
): string {
    if (['raw', 'path', 'source', 'bg', 'inlay', 'inlayed', 'inlayeddata'].includes(command)) {
        return asset.url
    }

    const source = escapeHtml(asset.url)
    const label = escapeHtml(asset.name)
    const extension = (asset.extension || '').replace(/^\./, '').toLocaleLowerCase()
    const mimeType = asset.mimeType || ''
    const image = (className = 'malang-message-image') =>
        `<img class="${className}" src="${source}" alt="${label}" loading="lazy" decoding="async">`

    if (command === 'image') return `<div class="risu-inlay-image">${image()}</div>\n`
    if (command === 'video' || command === 'videoimg') {
        const muted = command === 'videoimg' ? ' muted' : ''
        const controls = command === 'video' ? ' controls' : ''
        return `<video class="malang-message-media" autoplay loop${muted}${controls}><source src="${source}"${mimeType ? ` type="${escapeHtml(mimeType)}"` : ''}></video>\n`
    }
    if (command === 'audio') {
        return `<audio class="malang-message-media" controls><source src="${source}"${mimeType ? ` type="${escapeHtml(mimeType)}"` : ''}></audio>\n`
    }
    if (command === 'bgm') {
        return `<span risu-ctrl="bgm___auto___${source}" hidden></span>\n`
    }
    if (command === 'asset' && ['mp4', 'webm', 'avi', 'm4p', 'm4v'].includes(extension)) {
        return `<video class="malang-message-media" autoplay muted loop><source src="${source}"${mimeType ? ` type="${escapeHtml(mimeType)}"` : ''}></video>\n`
    }
    if (
        command === 'asset' &&
        (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(extension))
    ) {
        return `<audio class="malang-message-media" controls><source src="${source}"${mimeType ? ` type="${escapeHtml(mimeType)}"` : ''}></audio>\n`
    }
    return image(command === 'emotion' ? 'malang-message-image malang-emotion-image' : undefined)
}

function recordValue(record: Record<string, string>, normalizedName: string): string | undefined {
    for (const [key, value] of Object.entries(record)) {
        if (normalizeName(key) === normalizedName) return value
    }
    return undefined
}

function makeRisuArray(values: unknown[]): string {
    return JSON.stringify(
        values.map((value) =>
            typeof value === 'string' ? value.replaceAll('::', '\\u003A\\u003A') : value,
        ),
    )
}

function parseRisuDict(source: string): Record<string, unknown> {
    try {
        const value: unknown = JSON.parse(source)
        return value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {}
    } catch {
        return {}
    }
}

function stringifyCbsValue(value: unknown): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
        return String(value)
    if (typeof value === 'object') return JSON.stringify(value)
    return ''
}

function nestedElement(args: string[]): string {
    try {
        let current: unknown = JSON.parse(args[0] || 'null')
        for (const key of args.slice(1)) {
            if (!current || typeof current !== 'object') return 'null'
            current = (current as Record<string, unknown>)[key]
            if (current === undefined || current === null) return 'null'
        }
        return stringifyCbsValue(current)
    } catch {
        return 'null'
    }
}

function mutateArray(name: string, args: string[]): string {
    const array = parseRisuArray(args[0] || '')
    if (name === 'arrayshift') array.shift()
    else if (name === 'arraypop') array.pop()
    else if (name === 'arraypush') array.push(args[1] || '')
    else if (name === 'arraysplice') array.splice(Number(args[1]), Number(args[2]), args[3] || '')
    else {
        const index = Number(args[1])
        if (index >= array.length) array[index] = args[2] || ''
    }
    return makeRisuArray(array)
}

function makeRange(source: string): string {
    const values = parseRisuArray(source).map(Number)
    const start = values.length > 1 ? values[0] || 0 : 0
    const end = values.length > 1 ? values[1] || 0 : values[0] || 0
    const step = values.length > 2 ? values[2] || 1 : 1
    if (step === 0) return '[]'
    const result: string[] = []
    const compareStep = step > 0 ? (value: number) => value < end : (value: number) => value > end
    for (let value = start; compareStep(value) && result.length < 100_000; value += step)
        result.push(String(value))
    return makeRisuArray(result)
}

function filterArray(source: string, mode: string): string {
    const values = parseRisuArray(source)
    const filtered = values.filter((value, index) => {
        if (mode === 'nonempty') return value !== ''
        if (mode === 'unique') return index === values.indexOf(value)
        return value !== '' && index === values.indexOf(value)
    })
    return makeRisuArray(filtered)
}

function risuRole(role: string | undefined): string {
    if (role === 'assistant') return 'char'
    return role || 'null'
}

function historyValue(messages: NonNullable<TemplateContext['messages']>, args: string[]): string {
    if (args.length) {
        return makeRisuArray(
            messages.map(
                (message) =>
                    `${args.includes('role') ? `${risuRole(message.role)}: ` : ''}${message.content}`,
            ),
        )
    }
    return makeRisuArray(
        messages.map((message) =>
            JSON.stringify({
                role: risuRole(message.role),
                data: message.content,
                ...(message.createdAt ? { time: new Date(message.createdAt).getTime() } : {}),
            }),
        ),
    )
}

function roleHistory(
    messages: NonNullable<TemplateContext['messages']>,
    role: 'user' | 'assistant',
): string {
    return makeRisuArray(
        messages
            .filter((message) => message.role === role)
            .map((message) =>
                JSON.stringify({
                    role: risuRole(message.role),
                    data: message.content,
                    ...(message.createdAt ? { time: new Date(message.createdAt).getTime() } : {}),
                }),
            ),
    )
}

function messageDateValue(
    message: NonNullable<TemplateContext['messages']>[number] | undefined,
    timeOnly: boolean,
): string {
    if (!message?.createdAt) return '[Cannot get time]'
    const date = new Date(message.createdAt)
    return timeOnly ? date.toLocaleTimeString() : date.toLocaleDateString()
}

function idleDuration(
    messages: NonNullable<TemplateContext['messages']>,
    betweenUserMessages: boolean,
): string {
    const candidates = betweenUserMessages
        ? messages.filter((message) => message.role === 'user')
        : messages
    const latest = candidates.at(-1)
    if (!latest?.createdAt) return '00:00:00'
    const previous = betweenUserMessages ? candidates.at(-2) : undefined
    const start = new Date(latest.createdAt).getTime()
    const end = previous?.createdAt ? new Date(previous.createdAt).getTime() : Date.now()
    const seconds = Math.max(0, Math.floor(Math.abs(end - start) / 1000))
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function xorValue(source: string, decrypt: boolean): string {
    const bytes = decrypt ? Buffer.from(source, 'base64') : Buffer.from(source, 'utf8')
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (bytes[index] ?? 0) ^ 0xff
    return decrypt ? bytes.toString('utf8') : bytes.toString('base64')
}

function cryptValue(source: string, shiftValue: string): string {
    const shift = Number.isNaN(Number(shiftValue)) || !shiftValue ? 32_768 : Number(shiftValue)
    return Array.from(source)
        .map((character) => String.fromCharCode((character.charCodeAt(0) + shift) % 65_536))
        .join('')
}

function escapeHtml(source: string): string {
    return source
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function randomValue(args: string[], random: number): string {
    if (!args.length) return String(random)
    const values =
        args.length === 1
            ? args[0]?.startsWith('[') && args[0].endsWith(']')
                ? parseRisuArray(args[0])
                : (args[0] || '').replaceAll('\\,', '\uE000').split(/[:,]/)
            : args
    const selected = values[Math.floor(random * values.length)]
    return stringifyCbsValue(selected ?? '').replaceAll('\uE000', ',')
}

function deterministicRandom(seed: string): number {
    let hash = 2166136261
    for (const character of seed) {
        hash ^= character.charCodeAt(0)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0) / 0x1_0000_0000
}

function rollDice(notation: string, seededRandom: number): string {
    const parts = (notation || '1d6').toLocaleLowerCase().split('d')
    const count = parts.length === 2 ? Number(parts[0] || 1) : 1
    const sides = Number(parts.length === 2 ? parts[1] || 6 : parts[0] || 6)
    if (!Number.isFinite(count) || !Number.isFinite(sides) || count < 1 || sides < 1) return 'NaN'
    let total = 0
    for (let index = 0; index < count; index += 1) {
        const random = index === 0 ? seededRandom : deterministicRandom(`${seededRandom}:${index}`)
        total += Math.floor(random * sides) + 1
    }
    return String(total)
}

function formatDate(args: string[], timeOnly: boolean): string {
    const date = args[1] ? new Date(Number(args[1])) : new Date()
    if (!args.length)
        return timeOnly
            ? `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
            : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    return dateFormat(args[0] || '', date)
}

function dateFormat(format: string, date: Date): string {
    const dayOfYear = Math.floor(
        (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000,
    )
    return format
        .replaceAll('YYYY', String(date.getFullYear()))
        .replaceAll('YY', String(date.getFullYear()).slice(2))
        .replaceAll('MMMM', new Intl.DateTimeFormat('en', { month: 'long' }).format(date))
        .replaceAll('MMM', new Intl.DateTimeFormat('en', { month: 'short' }).format(date))
        .replaceAll('MM', String(date.getMonth() + 1).padStart(2, '0'))
        .replaceAll('DDDD', String(dayOfYear))
        .replaceAll('DD', String(date.getDate()).padStart(2, '0'))
        .replaceAll('dddd', new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date))
        .replaceAll('ddd', new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date))
        .replaceAll('HH', String(date.getHours()).padStart(2, '0'))
        .replaceAll('hh', String(date.getHours() % 12 || 12).padStart(2, '0'))
        .replaceAll('mm', String(date.getMinutes()).padStart(2, '0'))
        .replaceAll('ss', String(date.getSeconds()).padStart(2, '0'))
        .replaceAll('X', String(Math.floor(date.getTime() / 1000)))
        .replaceAll('x', String(date.getTime()))
        .replaceAll('A', date.getHours() >= 12 ? 'PM' : 'AM')
}

function metadataValue(key: string, context: TemplateContext): string {
    const normalized = normalizeName(key)
    if (normalized === 'node') return '1'
    if (normalized === 'local' || normalized === 'mobile') return '0'
    if (normalized === 'risutype') return 'node'
    if (
        normalized === 'modelname' ||
        normalized === 'modelinternalid' ||
        normalized === 'modelshortname'
    )
        return context.modelId || ''
    if (normalized === 'maxcontext') return String(context.maxContextTokens || '')
    return `Error: ${key} is not a valid metadata key.`
}

// Port of PocketRisu's calcString RPN engine, quirks included (`a=>b` is two comparisons, not >=).
function calculateExpression(
    source: string,
    runtime: TemplateRuntimeState,
    context: TemplateContext,
): string {
    return String(calcString(source, runtime, context))
}

function calcString(text: string, runtime: TemplateRuntimeState, context: TemplateContext): number {
    const depthText: string[] = ['']
    for (const character of text) {
        if (character === '(') {
            depthText.push('')
        } else if (character === ')' && depthText.length > 1) {
            const result = executeRpnCalculation(depthText.pop() || '', runtime, context)
            depthText[depthText.length - 1] = (depthText[depthText.length - 1] || '') + result
        } else {
            depthText[depthText.length - 1] = (depthText[depthText.length - 1] || '') + character
        }
    }
    return executeRpnCalculation(depthText.join(''), runtime, context)
}

const rpnOperators: Record<string, { precedence: number; rightAssociative: boolean }> = {
    '+': { precedence: 2, rightAssociative: false },
    '-': { precedence: 2, rightAssociative: false },
    '*': { precedence: 3, rightAssociative: false },
    '/': { precedence: 3, rightAssociative: false },
    '^': { precedence: 4, rightAssociative: false },
    '%': { precedence: 3, rightAssociative: false },
    '<': { precedence: 1, rightAssociative: false },
    '>': { precedence: 1, rightAssociative: false },
    '|': { precedence: 1, rightAssociative: false },
    '&': { precedence: 1, rightAssociative: false },
    '≤': { precedence: 1, rightAssociative: false },
    '≥': { precedence: 1, rightAssociative: false },
    '=': { precedence: 1, rightAssociative: false },
    '≠': { precedence: 1, rightAssociative: false },
    '!': { precedence: 5, rightAssociative: true },
}

// Mirrors `parseFloat(token) || token === '0'`.
function isRpnNumberToken(token: string): boolean {
    const parsed = Number.parseFloat(token)
    return (!Number.isNaN(parsed) && parsed !== 0) || token === '0'
}

function toRpn(expression: string): string {
    const stripped = expression.replace(/\s+/g, '')
    const rawTokens: string[] = []
    let lastToken = ''
    for (let index = 0; index < stripped.length; index += 1) {
        const character = stripped[index] || ''
        const previous = stripped[index - 1]
        if (
            character === '-' &&
            (index === 0 || (previous && Object.hasOwn(rpnOperators, previous)) || previous === '(')
        ) {
            lastToken += character
        } else if (Object.hasOwn(rpnOperators, character)) {
            rawTokens.push(lastToken || '0')
            lastToken = ''
            rawTokens.push(character)
        } else {
            lastToken += character
        }
    }
    rawTokens.push(lastToken || '0')

    const output: string[] = []
    const operatorStack: string[] = []
    for (const token of rawTokens) {
        if (isRpnNumberToken(token)) {
            output.push(token)
            continue
        }
        const current = rpnOperators[token]
        if (!current) continue
        while (operatorStack.length > 0) {
            const top = rpnOperators[operatorStack[operatorStack.length - 1] || '']
            if (!top) break
            const shouldPop = current.rightAssociative
                ? current.precedence < top.precedence
                : current.precedence <= top.precedence
            if (!shouldPop) break
            output.push(operatorStack.pop() as string)
        }
        operatorStack.push(token)
    }
    while (operatorStack.length > 0) output.push(operatorStack.pop() as string)
    return output.join(' ')
}

function calculateRpn(expression: string): number {
    const stack: number[] = []
    for (const token of expression.split(' ')) {
        if (isRpnNumberToken(token)) {
            stack.push(Number.parseFloat(token))
            continue
        }
        const b = stack.pop()
        const a = stack.pop()
        const left = a ?? 0
        const right = b ?? 0
        switch (token) {
            case '+':
                stack.push(left + right)
                break
            case '-':
                stack.push(left - right)
                break
            case '*':
                stack.push(left * right)
                break
            case '/':
                stack.push(left / right)
                break
            case '^':
                stack.push(left ** right)
                break
            case '%':
                stack.push(left % right)
                break
            case '<':
                stack.push(left < right ? 1 : 0)
                break
            case '>':
                stack.push(left > right ? 1 : 0)
                break
            case '|':
                stack.push(left || right)
                break
            case '&':
                stack.push(left && right)
                break
            case '≤':
                stack.push(left <= right ? 1 : 0)
                break
            case '≥':
                stack.push(left >= right ? 1 : 0)
                break
            case '=':
                stack.push(left === right ? 1 : 0)
                break
            case '≠':
                stack.push(left !== right ? 1 : 0)
                break
            case '!':
                stack.push(right ? 0 : 1)
                break
            default:
                break
        }
    }
    return stack.length === 0 ? 0 : (stack.pop() ?? 0)
}

function executeRpnCalculation(
    text: string,
    runtime: TemplateRuntimeState,
    context: TemplateContext,
): number {
    const resolved = text
        .replace(/\$([a-zA-Z0-9_]+)/g, (_full, key: string) => {
            const parsed = Number.parseFloat(chatVariable(key, context, runtime) ?? '')
            return Number.isNaN(parsed) ? '0' : String(parsed)
        })
        .replace(/@([a-zA-Z0-9_]+)/g, (_full, key: string) => {
            const parsed = Number.parseFloat(context.globalVariables[key] ?? '')
            return Number.isNaN(parsed) ? '0' : String(parsed)
        })
        .replace(/&&/g, '&')
        .replace(/\|\|/g, '|')
        .replace(/<=/g, '≤')
        .replace(/>=/g, '≥')
        .replace(/==/g, '=')
        .replace(/!=/g, '≠')
        .replace(/null/gi, '0')
    return calculateRpn(toRpn(resolved))
}

function compareNumber(left: string | undefined, right: string | undefined, operator: string) {
    const a = Number(left)
    const b = Number(right)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return '0'
    if (operator === '>') return a > b ? '1' : '0'
    if (operator === '<') return a < b ? '1' : '0'
    if (operator === '>=') return a >= b ? '1' : '0'
    return a <= b ? '1' : '0'
}

function evaluateWhen(
    raw: string,
    context: TemplateContext,
    runtime: TemplateRuntimeState,
): boolean {
    const expression = raw.startsWith('::') ? raw.slice(2) : raw.trim()
    if (!expression) return false
    if (!raw.startsWith('::')) return isRisuTruthy(expression.split(' ', 1)[0])
    const statement = expression.split('::')
    while (statement.length > 1) {
        const condition = statement.pop() || ''
        const operator = statement.pop() || ''
        const left = () => statement.pop() || ''
        if (operator === 'not') statement.push(isRisuTruthy(condition) ? '0' : '1')
        else if (operator === 'keep' || operator === 'legacy') statement.push(condition)
        else if (operator === 'and') {
            const leftCondition = left()
            statement.push(isRisuTruthy(condition) && isRisuTruthy(leftCondition) ? '1' : '0')
        } else if (operator === 'or') {
            const leftCondition = left()
            statement.push(isRisuTruthy(condition) || isRisuTruthy(leftCondition) ? '1' : '0')
        } else if (operator === 'is') statement.push(condition === left() ? '1' : '0')
        else if (operator === 'isnot') statement.push(condition !== left() ? '1' : '0')
        else if (operator === 'var')
            statement.push(isRisuTruthy(chatVariable(condition, context, runtime)) ? '1' : '0')
        else if (operator === 'toggle') statement.push(context.toggles[condition] ? '1' : '0')
        else if (operator === 'vis')
            statement.push(chatVariable(left(), context, runtime) === condition ? '1' : '0')
        else if (operator === 'visnot')
            statement.push(chatVariable(left(), context, runtime) !== condition ? '1' : '0')
        else if (operator === 'tis')
            statement.push((context.toggleValues?.[left()] ?? '') === condition ? '1' : '0')
        else if (operator === 'tisnot')
            statement.push((context.toggleValues?.[left()] ?? '') !== condition ? '1' : '0')
        else if (['>', '<', '>=', '<='].includes(operator))
            statement.push(compareNumber(left(), condition, operator))
        else statement.push(isRisuTruthy(condition) ? '1' : '0')
    }
    return isRisuTruthy(statement[0])
}

function isRisuTruthy(value: string | undefined): boolean {
    return value === '1' || value === 'true'
}

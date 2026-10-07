import { describe, expect, test } from 'bun:test'

import type { RegexScript } from '@malang/shared'

import { RisuParser, type ChatTurn } from '@/services/prompt/pocketrisu/parser'
import { processScripts, RegexSandbox } from '@/services/prompt/pocketrisu/scripts'

function script(input: Partial<RegexScript> & Pick<RegexScript, 'pattern' | 'replacement'>) {
    return {
        id: crypto.randomUUID(),
        comment: '',
        phase: 'editoutput',
        enabled: true,
        flags: 'g',
        ...input,
    } as RegexScript
}

async function run(input: {
    data: string
    scripts: RegexScript[]
    chat?: ChatTurn[]
    chatId?: number
    greeting?: string
    timeoutMs?: number
}) {
    const warnings: string[] = []
    const parser = new RisuParser(
        { values: {}, globalVariables: { toggle_style: '1' }, toggles: { style: true } },
        {},
        {},
        input.chat ?? [],
        input.greeting ?? '',
        warnings,
    )
    const chatId = input.chatId ?? -1
    const sandbox = new RegexSandbox(input.timeoutMs)
    try {
        const text = await processScripts({
            scripts: input.scripts,
            data: input.data,
            mode: 'editoutput',
            chatId,
            parse: (text) => parser.parse(text, { chatId }),
            parser,
            sandbox,
            warnings,
        })
        return { text, warnings }
    } finally {
        sandbox.close()
    }
}

const turn = (role: ChatTurn['role'], data: string): ChatTurn => ({
    id: crypto.randomUUID(),
    role,
    data,
})

describe('PocketRisu regex scripts', () => {
    test('runs higher order first and parses CBS after each replacement', async () => {
        const result = await run({
            data: 'moon',
            scripts: [
                script({ pattern: 'silver', replacement: 'gold', flags: 'g<order 1>' }),
                script({
                    pattern: 'moon',
                    replacement: '{{#if {{? {{getglobalvar::toggle_style}}=1 }}}}silver{{/if}}',
                    flags: 'g<order 2>',
                }),
            ],
        })
        expect(result.text).toBe('gold')
    })

    test('skips a timed-out script and keeps the data from before it', async () => {
        const source = `${'a'.repeat(100_000)}!`
        const result = await run({
            data: source,
            timeoutMs: 20,
            scripts: [script({ pattern: '(a+)+$', replacement: 'x' })],
        })
        expect(result.text).toBe(source)
        expect(result.warnings.some((warning) => warning.includes('timed out'))).toBeTrue()
    })

    test('repeat_back appends the previous same-role match when the output lacks it', async () => {
        const result = await run({
            data: 'Hello',
            chat: [turn('char', 'Hi [HP 10]'), turn('user', 'hey'), turn('char', 'Hello')],
            chatId: 2,
            scripts: [script({ pattern: '\\[HP \\d+\\]', replacement: '@@repeat_back end_nl' })],
        })
        expect(result.text).toBe('Hello\n[HP 10]')
    })

    test('repeat_back falls back to the greeting', async () => {
        const status = script({ pattern: '\\[HP \\d+\\]', replacement: '@@repeat_back start' })
        const fromGreeting = await run({
            data: 'Hello',
            chat: [turn('user', 'hey'), turn('char', 'Hello')],
            chatId: 1,
            greeting: '[HP 7] Welcome',
            scripts: [status],
        })
        expect(fromGreeting.text).toBe('[HP 7]Hello')
    })

    test('repeat_back on a matching output replaces the match with its own text', async () => {
        // processScriptFull sends a matched repeat_back to the plain replace branch.
        const result = await run({
            data: 'Hello [HP 3]',
            chat: [turn('char', '[HP 9]'), turn('char', 'Hello [HP 3]')],
            chatId: 1,
            scripts: [script({ pattern: '\\[HP \\d+\\]', replacement: '@@repeat_back start' })],
        })
        expect(result.text).toBe('Hello @@repeat_back start')
    })

    test('repeat_back does nothing for the input message (chatID -1)', async () => {
        const result = await run({
            data: 'Hello',
            greeting: '[HP 7]',
            scripts: [script({ pattern: '\\[HP \\d+\\]', replacement: '@@repeat_back end' })],
        })
        expect(result.text).toBe('Hello')
    })
})

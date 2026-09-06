import { describe, expect, test } from 'bun:test'

import {
    compilePrompt,
    isPromptToggleEnabled,
    mergeGenerationParameters,
} from '../src/services/prompt/compiler'

describe('generation parameter merging', () => {
    test('treats RisuAI -1000 sentinels as unset', () => {
        const parameters = mergeGenerationParameters(
            {
                temperature: 0.8,
                topP: 0.9,
                topK: 40,
                repetitionPenalty: 1.1,
                maxOutputTokens: 2048,
            },
            {
                temperature: -1000,
                topP: -1000,
                topK: -1000,
                repetitionPenalty: -1000,
                maxOutputTokens: -1000,
            },
        )

        expect(parameters).toEqual({
            temperature: 0.8,
            topP: 0.9,
            topK: 40,
            repetitionPenalty: 1.1,
            maxContextTokens: 8192,
            maxOutputTokens: 2048,
        })
    })

    test('omits stale -1000 provider defaults', () => {
        const parameters = mergeGenerationParameters({ topP: -1000, topK: -1000 }, {})

        expect(parameters).toEqual({
            temperature: 0.9,
            maxContextTokens: 8192,
            maxOutputTokens: 512,
        })
    })
})

describe('prompt toggle values', () => {
    // RisuAI's own toggle checks (CBS `#when::toggle::key`, its `isTruthy`) only ever treat an
    // exact '1' or 'true' as on; everything else — including select-style non-zero indices or
    // free text — reads as off there, so this must match exactly for identical compiled output.
    test('treats only an exact "1" or "true" as enabled', () => {
        expect(isPromptToggleEnabled('1')).toBe(true)
        expect(isPromptToggleEnabled('true')).toBe(true)
    })

    test('treats every other value as disabled', () => {
        expect(isPromptToggleEnabled('2')).toBe(false)
        expect(isPromptToggleEnabled('custom instruction')).toBe(false)
        expect(isPromptToggleEnabled('0')).toBe(false)
        expect(isPromptToggleEnabled('false')).toBe(false)
        expect(isPromptToggleEnabled('off')).toBe(false)
        expect(isPromptToggleEnabled('')).toBe(false)
        expect(isPromptToggleEnabled('True')).toBe(false)
        expect(isPromptToggleEnabled(' 1')).toBe(false)
    })
})

describe('server-side Risu CBS compilation', () => {
    test('expands #each from the real message context before provider dispatch', () => {
        const input = {
            character: {
                id: 'character',
                name: 'Aria',
                description: '',
                personality: '',
                scenario: '',
                firstMessage: 'Hello',
                exampleMessage: '',
                systemPrompt: '',
                postHistoryInstructions: '',
                lorebook: [],
                loreSettings: {},
                regexScripts: [],
            },
            conversation: {
                id: 'conversation',
                variables: {},
                toggles: {},
                authorNote: '',
            },
            messages: [
                { id: 'one', role: 'user', content: 'one', createdAt: new Date().toISOString() },
                {
                    id: 'two',
                    role: 'assistant',
                    content: 'two',
                    createdAt: new Date().toISOString(),
                },
                {
                    id: 'three',
                    role: 'user',
                    content: 'three',
                    createdAt: new Date().toISOString(),
                },
            ],
            preset: {
                warnings: [],
                toggles: [],
                defaultVariables: {},
                parameters: {},
                regexScripts: [],
                blocks: [
                    {
                        id: 'block',
                        enabled: true,
                        type: 'plain',
                        type2: 'main',
                        role: 'system',
                        text: '{{#each {{? {{lastmessageid}}}} item}}[{{slot::item}}]{{/each}}',
                    },
                ],
                promptSettings: {
                    sendChatAsSystem: false,
                    sendName: false,
                    assistantPrefill: '',
                },
            },
            settings: {
                userName: 'Mina',
                globalVariables: {},
            },
            parameters: { maxContextTokens: 8192, maxOutputTokens: 512 },
        } as unknown as Parameters<typeof compilePrompt>[0]

        const result = compilePrompt(input)

        expect(result.messages).toEqual([{ role: 'system', content: '[2]' }])
    })
})

describe('PocketRisu module custom toggles', () => {
    function input(auto: string) {
        return {
            character: {
                id: 'character',
                name: 'Aria',
                description: '',
                personality: '',
                scenario: '',
                firstMessage: '',
                exampleMessage: '',
                systemPrompt: '',
                postHistoryInstructions: '',
                lorebook: [],
                loreSettings: {},
                regexScripts: [],
            },
            conversation: { id: 'conversation', variables: {}, toggles: {}, authorNote: '' },
            messages: [],
            preset: {
                warnings: [],
                toggles: [],
                defaultVariables: {},
                parameters: {},
                regexScripts: [],
                blocks: [],
                promptSettings: { sendChatAsSystem: false, sendName: false, assistantPrefill: '' },
            },
            modules: [
                {
                    id: 'module',
                    name: 'GigaTrans',
                    warnings: [],
                    lorebook: [],
                    regexScripts: [],
                    toggles: [
                        {
                            key: 'gigatrans.auto',
                            label: '자동 번역',
                            type: 'boolean',
                            options: [],
                            defaultValue: '',
                        },
                        {
                            key: 'gigatrans.ctxmode',
                            label: '컨텍스트 모드',
                            type: 'select',
                            options: ['기본', '반전', '번역만 반전'],
                            defaultValue: '0',
                        },
                    ],
                    prompts: [
                        {
                            id: 'module-prompt',
                            name: 'translation',
                            enabled: true,
                            toggleKey: 'gigatrans.auto',
                            role: 'system',
                            position: 'afterMain',
                            content: 'mode={{getglobalvar::toggle_gigatrans.ctxmode}}',
                        },
                    ],
                },
            ],
            settings: {
                userName: 'Mina',
                globalVariables: {},
                promptToggleValues: {
                    'gigatrans.auto': auto,
                    'gigatrans.ctxmode': '2',
                },
            },
            parameters: { maxContextTokens: 8192, maxOutputTokens: 512 },
        } as unknown as Parameters<typeof compilePrompt>[0]
    }

    test('exposes active module values to toggle gates and getglobalvar', () => {
        expect(compilePrompt(input('1')).messages).toContainEqual({
            role: 'system',
            content: 'mode=2',
        })
    })

    test('does not run a module prompt when its custom boolean is off', () => {
        expect(compilePrompt(input('0')).messages).toEqual([])
    })
})

describe('RisuAI-compatible jailbreak / chain-of-thought toggles', () => {
    function baseInput() {
        return {
            character: {
                id: 'character',
                name: 'Aria',
                description: '',
                personality: '',
                scenario: '',
                firstMessage: 'Hi there',
                exampleMessage: '',
                systemPrompt: '',
                postHistoryInstructions: '',
                lorebook: [],
                loreSettings: {},
                regexScripts: [],
            },
            conversation: { id: 'conversation', variables: {}, toggles: {}, authorNote: '' },
            messages: [
                { id: 'greet', role: 'assistant', content: 'Hi there', createdAt: '2024-01-01' },
            ],
            preset: {
                warnings: [],
                toggles: [],
                defaultVariables: {},
                parameters: {},
                regexScripts: [],
                blocks: [
                    {
                        id: 'jb',
                        enabled: true,
                        type: 'jailbreak',
                        type2: 'normal',
                        role: 'system',
                        text: 'JAILBREAK-TEXT',
                    },
                    {
                        id: 'cot',
                        enabled: true,
                        type: 'cot',
                        type2: 'normal',
                        role: 'system',
                        text: 'COT-TEXT',
                    },
                ],
                promptSettings: { sendChatAsSystem: false, sendName: false, assistantPrefill: '' },
            },
            settings: { userName: 'Mina', globalVariables: {} },
            parameters: { maxContextTokens: 8192, maxOutputTokens: 512 },
        } as unknown as Parameters<typeof compilePrompt>[0]
    }

    // RisuAI gates every `jailbreak`/`cot` block behind its own global switch, independent of
    // the block's `enabled` flag — the bug this guards against is a jailbreak block staying
    // active no matter what a "disable it" toggle is set to.
    test('drops jailbreak and cot blocks when their global switch is off', () => {
        const result = compilePrompt(baseInput())
        const contents = result.messages.map((message) => message.content)
        expect(contents).not.toContain('JAILBREAK-TEXT')
        expect(contents).not.toContain('COT-TEXT')
    })

    test('includes jailbreak block once jailbreakToggle is on', () => {
        const input = baseInput()
        input.settings.jailbreakToggle = true
        const result = compilePrompt(input)
        expect(result.messages.map((message) => message.content)).toContain('JAILBREAK-TEXT')
    })

    test('includes cot block once chainOfThought is on', () => {
        const input = baseInput()
        input.settings.chainOfThought = true
        const result = compilePrompt(input)
        expect(result.messages.map((message) => message.content)).toContain('COT-TEXT')
    })
})

describe('RisuAI-compatible sendName / sendChatAsSystem formatting', () => {
    function baseInput() {
        return {
            character: {
                id: 'character',
                name: 'Aria',
                description: '',
                personality: '',
                scenario: '',
                firstMessage: 'Hi there',
                exampleMessage: '',
                systemPrompt: '',
                postHistoryInstructions: '',
                lorebook: [],
                loreSettings: {},
                regexScripts: [],
            },
            conversation: { id: 'conversation', variables: {}, toggles: {}, authorNote: '' },
            messages: [
                { id: 'greet', role: 'assistant', content: 'Hi there', createdAt: '2024-01-01' },
                { id: 'u1', role: 'user', content: 'Hello', createdAt: '2024-01-02' },
            ],
            preset: {
                warnings: [],
                toggles: [],
                defaultVariables: {},
                parameters: {},
                regexScripts: [],
                blocks: [
                    { id: 'chat', enabled: true, type: 'chat', rangeStart: 0, rangeEnd: 'end' },
                ],
                promptSettings: { sendChatAsSystem: false, sendName: true, assistantPrefill: '' },
            },
            settings: { userName: 'Mina', globalVariables: {} },
            parameters: { maxContextTokens: 8192, maxOutputTokens: 512 },
        } as unknown as Parameters<typeof compilePrompt>[0]
    }

    // RisuAI only ever gives the persisted greeting the plain "Char: text" prefix; every later
    // turn (user or assistant) is wrapped in groupTemplate using the character's own name.
    test('wraps history in groupTemplate but keeps the greeting as a plain prefix', () => {
        const result = compilePrompt(baseInput())
        expect(result.messages).toEqual([
            { role: 'assistant', content: 'Aria: Hi there' },
            { role: 'user', content: "<Aria's Message>\nHello\n</Aria's Message>" },
        ])
    })

    // Non-greeting turns get sendName's wrap AND (when sendChatAsSystem is also on) the
    // "role: " prefix from systemizeChat — RisuAI applies both, back to back, on those turns.
    test('stacks sendChatAsSystem on top of an already sendName-wrapped turn', () => {
        const input = baseInput()
        input.preset.promptSettings.sendChatAsSystem = true
        const result = compilePrompt(input)
        expect(result.messages).toEqual([
            { role: 'system', content: 'Aria: Hi there' },
            { role: 'system', content: "user: <Aria's Message>\nHello\n</Aria's Message>" },
        ])
    })

    test('chatAsOriginalOnSystem opts a chat block out of sendChatAsSystem', () => {
        const input = baseInput()
        input.preset.promptSettings.sendChatAsSystem = true
        ;(input.preset.blocks[0] as { chatAsOriginalOnSystem?: boolean }).chatAsOriginalOnSystem =
            true
        const result = compilePrompt(input)
        expect(result.messages).toEqual([
            { role: 'assistant', content: 'Aria: Hi there' },
            { role: 'user', content: "<Aria's Message>\nHello\n</Aria's Message>" },
        ])
    })

    test('appends PocketRisu start-new-chat marker when requested', () => {
        const input = baseInput()
        input.includeStartNewChat = true
        expect(compilePrompt(input).messages.at(-1)).toEqual({
            role: 'system',
            content: '[Start a new chat]',
        })
    })

    test('trimStartNewChat suppresses the PocketRisu marker', () => {
        const input = baseInput()
        input.includeStartNewChat = true
        input.preset.promptSettings.trimStartNewChat = true
        expect(compilePrompt(input).messages.map((message) => message.content)).not.toContain(
            '[Start a new chat]',
        )
    })
})

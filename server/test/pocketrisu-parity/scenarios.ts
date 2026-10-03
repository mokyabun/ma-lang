import type { PromptScenario } from '../../../scripts/pocketrisu-oracle/protocol'

/*
 * Prompt parity scenarios, written in PocketRisu's own export formats so both
 * apps load them through their real importers. Each scenario should exercise
 * one feature on top of a small shared baseline; keep them deterministic
 * (no {{random}}, dates or token-budget trimming).
 */

type CardData = Record<string, unknown>
type Block = Record<string, unknown>

function card(data: CardData = {}): Record<string, unknown> {
    return {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
            name: 'Aria',
            description: '{{char}} is a barista who talks to {{user}}.',
            personality: '',
            scenario: '',
            first_mes: 'Welcome in, {{user}}!',
            mes_example: '',
            creator_notes: '',
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: [],
            tags: [],
            creator: '',
            character_version: '',
            group_only_greetings: [],
            ...data,
            extensions: { ...(data.extensions as object | undefined) },
        },
    }
}

const main = (text: string): Block => ({ type: 'plain', type2: 'main', text, role: 'system' })
const globalNote = (text: string): Block => ({
    type: 'plain',
    type2: 'globalNote',
    text,
    role: 'system',
})
const chat = (rangeStart = 0, rangeEnd: number | 'end' = 'end'): Block => ({
    type: 'chat',
    rangeStart,
    rangeEnd,
})

const baselineBlocks: Block[] = [
    main('You are {{char}}. Stay in character.'),
    { type: 'description' },
    { type: 'persona' },
    { type: 'lorebook' },
    chat(),
    { type: 'authornote' },
    globalNote('Reply in two short paragraphs.'),
]

function preset(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { name: 'Parity', promptTemplate: baselineBlocks, ...extra }
}

const user = { name: 'Kim' }

const shortChat: PromptScenario['chat'] = {
    messages: [
        { role: 'user', data: 'One latte, please.' },
        { role: 'char', data: 'Coming right up.' },
        { role: 'user', data: 'Thanks, {{char}}!' },
    ],
}

function lore(entry: Record<string, unknown>): Record<string, unknown> {
    return {
        keys: [],
        content: '',
        extensions: {},
        enabled: true,
        insertion_order: 100,
        constant: false,
        selective: false,
        secondary_keys: [],
        comment: '',
        name: '',
        case_sensitive: false,
        use_regex: false,
        ...entry,
    }
}

function characterBook(entries: Record<string, unknown>[]) {
    return {
        name: '',
        description: '',
        scan_depth: 10,
        token_budget: 100_000,
        recursive_scanning: false,
        extensions: {},
        entries: entries.map(lore),
    }
}

export const promptScenarios: Record<string, PromptScenario> = {
    baseline: {
        preset: preset(),
        character: card(),
        user,
        chat: shortChat,
    },

    'persona-and-author-note': {
        preset: preset({
            promptTemplate: [
                main('Main prompt.'),
                { type: 'persona', innerFormat: '<persona>\n{{slot}}\n</persona>' },
                { type: 'description', innerFormat: '<char>\n{{slot}}\n</char>' },
                chat(),
                { type: 'authornote', innerFormat: '[Note: {{slot}}]' },
            ],
        }),
        character: card({
            personality: 'Cheerful and precise.',
            scenario: 'A rainy morning at the cafe.',
        }),
        user: { name: 'Kim', persona: '{{user}} is a regular who always orders a latte.' },
        chat: { ...shortChat, note: '{{char}} is tired today.' },
    },

    'cbs-in-messages': {
        preset: preset({
            promptTemplate: [
                main('HP {{getvar::hp}} / last id {{lastmessageid}}'),
                chat(),
                globalNote('Last: {{lastmessage}}'),
            ],
        }),
        character: card(),
        user,
        chat: {
            messages: [
                { role: 'user', data: 'Hit! {{setvar::hp::7}}{{getvar::hp}}' },
                { role: 'char', data: '{{addvar::hp::-2}}Ouch. HP is {{getvar::hp}}.' },
                { role: 'user', data: '{{#if {{equal::{{getvar::hp}}::5}}}}Five left{{/if}}' },
            ],
            variables: { hp: '10' },
        },
    },

    'cbs-expressions': {
        preset: preset({
            promptTemplate: [
                main(
                    [
                        '{{// a comment that must disappear}}',
                        'sum={{? 1 + 2 * 3}}',
                        'upper={{upper::{{char}}}}',
                        'replace={{replace::latte::a::o}}',
                        'len={{length::{{user}}}}',
                        'when={{#when::{{getglobalvar::season}}::is::winter}}cold{{:else}}warm{{/when}}',
                        'global={{getglobalvar::season}}',
                    ].join('\n'),
                ),
                chat(),
            ],
        }),
        character: card(),
        user,
        chat: shortChat,
        globalVariables: { season: 'winter' },
    },

    toggles: {
        preset: preset({
            customPromptTemplateToggle: 'nsfw=Allow mature\nstyle=Style=select=Plain,Ornate',
            promptTemplate: [
                main(
                    '{{#if {{getglobalvar::toggle_nsfw}}}}Mature allowed.{{/if}} style={{getglobalvar::toggle_style}}',
                ),
                chat(),
                globalNote(
                    '{{#when::toggle::nsfw}}toggle-when on{{:else}}toggle-when off{{/when}}',
                ),
            ],
        }),
        character: card(),
        user,
        chat: shortChat,
        toggles: { nsfw: '1', style: '1' },
    },

    'jailbreak-and-cot': {
        preset: preset({
            promptTemplate: [
                main('Main.'),
                chat(),
                { type: 'jailbreak', type2: 'normal', text: 'Jailbreak block.', role: 'system' },
                { type: 'cot', type2: 'normal', text: 'Think first.', role: 'system' },
            ],
        }),
        character: card(),
        user,
        chat: shortChat,
        jailbreakToggle: true,
        chainOfThought: false,
    },

    'block-roles': {
        preset: preset({
            promptTemplate: [
                main('System main.'),
                { type: 'plain', type2: 'normal', text: 'As user.', role: 'user' },
                { type: 'plain', type2: 'normal', text: 'As bot.', role: 'bot' },
                { type: 'description', role2: 'user' },
                chat(),
                { type: 'plain', type2: 'normal', text: 'Tail system.', role: 'system' },
            ],
        }),
        character: card(),
        user,
        chat: shortChat,
    },

    'system-prompt-and-post-history': {
        preset: preset(),
        character: card({
            system_prompt: 'Card system prompt. Original was: {{original}}',
            post_history_instructions: 'Card note before: {{original}}',
        }),
        user,
        chat: shortChat,
    },

    'alternate-greeting': {
        preset: preset(),
        character: card({ alternate_greetings: ['Oh, {{user}}. You again.'] }),
        user,
        chat: { ...shortChat, fmIndex: 0 },
    },

    'example-dialogue': {
        preset: preset(),
        character: card({
            mes_example:
                '<START>\n{{user}}: What do you recommend?\n{{char}}: The house blend.\nIt is smooth.\n<START>\n{{user}}: Any pastries?\n{{char}}: Croissants.',
        }),
        user,
        chat: shortChat,
    },

    'send-name-group-template': {
        preset: preset({
            promptSettings: {
                assistantPrefill: '',
                postEndInnerFormat: '',
                sendChatAsSystem: false,
                sendName: true,
                utilOverride: false,
            },
            groupTemplate: '[{{char}} turn]\n{{slot}}',
        }),
        character: card(),
        user,
        chat: shortChat,
    },

    'send-chat-as-system': {
        preset: preset({
            promptSettings: {
                assistantPrefill: '',
                postEndInnerFormat: '',
                sendChatAsSystem: true,
                sendName: false,
                utilOverride: false,
            },
        }),
        character: card(),
        user,
        chat: shortChat,
    },

    'trim-start-new-chat-and-post-end': {
        preset: preset({
            promptSettings: {
                assistantPrefill: '',
                postEndInnerFormat: 'Post end format.',
                sendChatAsSystem: false,
                sendName: false,
                utilOverride: false,
                trimStartNewChat: true,
            },
        }),
        character: card(),
        user,
        chat: shortChat,
    },

    'chat-ranges': {
        preset: preset({
            promptTemplate: [
                main('Main.'),
                chat(0, -2),
                { type: 'plain', type2: 'normal', text: 'Between ranges.', role: 'system' },
                chat(-2, 'end'),
            ],
        }),
        character: card(),
        user,
        chat: {
            messages: [
                { role: 'user', data: 'm1' },
                { role: 'char', data: 'm2' },
                { role: 'user', data: 'm3' },
                { role: 'char', data: 'm4' },
                { role: 'user', data: 'm5' },
            ],
        },
    },

    'chatml-block': {
        preset: preset({
            promptTemplate: [
                main('Main.'),
                {
                    type: 'chatML',
                    text: '<|im_start|>system\nChatML system for {{char}}<|im_end|>\n<|im_start|>user\nChatML user<|im_end|>\n<|im_start|>assistant\nChatML assistant<|im_end|>',
                },
                chat(),
            ],
        }),
        character: card(),
        user,
        chat: shortChat,
    },

    'lorebook-keywords-and-constant': {
        preset: preset(),
        character: card({
            character_book: characterBook([
                { keys: ['latte'], content: 'Lattes here use oat milk.', comment: 'latte' },
                { keys: ['espresso'], content: 'Never triggered.', comment: 'espresso' },
                {
                    keys: [],
                    constant: true,
                    content: 'The cafe is called Moonbean.',
                    comment: 'constant',
                    insertion_order: 50,
                },
            ]),
        }),
        user,
        chat: shortChat,
    },

    'lorebook-decorators': {
        preset: preset(),
        character: card({
            character_book: characterBook([
                {
                    constant: true,
                    content: '@@depth 1\n@@role user\nDepth-1 reminder.',
                    comment: 'depth',
                },
                {
                    constant: true,
                    content: '@@position after_desc\nAfter description lore.',
                    comment: 'after-desc',
                },
                {
                    constant: true,
                    content: '@@position before_desc\nBefore description lore.',
                    comment: 'before-desc',
                },
            ]),
        }),
        user,
        chat: shortChat,
    },

    'regex-editprocess': {
        preset: preset({
            regex: [
                {
                    comment: 'latte to mocha',
                    in: 'latte',
                    out: 'mocha',
                    type: 'editprocess',
                    flag: 'g',
                    ableFlag: true,
                },
            ],
        }),
        character: card({ first_mes: 'Want a latte, {{user}}?' }),
        user,
        chat: shortChat,
    },

    'module-lorebook-and-toggle': {
        preset: preset({
            promptTemplate: [
                main('{{#if {{getglobalvar::toggle_extra}}}}Module toggle on.{{/if}}'),
                { type: 'lorebook' },
                chat(),
            ],
        }),
        character: card(),
        modules: [
            {
                type: 'risuModule',
                name: 'Cafe extras',
                description: '',
                id: 'parity-module',
                customModuleToggle: 'extra=Extra rules',
                lorebook: [
                    {
                        key: 'latte',
                        secondkey: '',
                        insertorder: 100,
                        comment: 'module latte',
                        content: 'Module lore about lattes.',
                        mode: 'normal',
                        alwaysActive: false,
                        selective: false,
                    },
                ],
            },
        ],
        user,
        chat: shortChat,
        toggles: { extra: '1' },
    },
}

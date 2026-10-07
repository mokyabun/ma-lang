import type { PromptScenario } from '../../../scripts/pocketrisu-oracle/protocol'

// Scenarios in PocketRisu export formats: one feature each, deterministic (no {{random}} or
// dates). Only scenarios with a `context` budget trim history.

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

const koreanLines = [
    '오늘은 비가 와서 카페 안이 유난히 조용하네.',
    '창가 자리에 앉아서 따뜻한 라떼를 천천히 마셨어.',
    '지난주에 말했던 원두가 드디어 들어왔다고 들었는데 맞아?',
    '응, 에티오피아 예가체프야. 꽃향기가 정말 진하게 나.',
    '그럼 핸드드립으로 한 잔 부탁할게. 시럽은 빼 주고.',
    '물 온도는 구십이 도로 맞추고 삼 분 동안 내릴게.',
    '기다리는 동안 새로 나온 케이크도 구경해도 될까?',
    '물론이지. 오늘 아침에 구운 레몬 파운드가 제일 인기야.',
    '레몬 파운드 한 조각이랑 같이 계산해 줘.',
    '카드로 할게? 아니면 지난번처럼 쿠폰을 쓸래?',
    '쿠폰 도장이 아홉 개니까 이번에 열 개 채우고 싶어.',
    '좋아, 도장 찍었어. 다음 방문 때는 음료 한 잔이 무료야.',
]
const koreanChat: PromptScenario['chat'] = {
    messages: koreanLines.map((data, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('char' as const),
        data,
    })),
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

    'variable-semantics': {
        preset: preset({
            templateDefaultVariables: 'mood=calm\nweather=sunny',
            promptTemplate: [
                main(
                    [
                        'keep={{setvar::ignored::1}}',
                        'missing={{getvar::nothing}}',
                        'preset default={{getvar::weather}}',
                        'card default={{getvar::mood}}',
                        'global missing={{getglobalvar::nothing}}',
                        'counter={{getvar::counter}}',
                    ].join('\n'),
                ),
                chat(),
            ],
        }),
        character: card({ extensions: { risuai: { defaultVariables: 'mood=sleepy' } } }),
        user,
        chat: {
            messages: [
                { role: 'user', data: '{{addvar::counter::1}}{{setdefaultvar::mood::angry}}one' },
                { role: 'char', data: '{{addvar::counter::1}}mood {{getvar::mood}}' },
                { role: 'user', data: 'counter now {{getvar::counter}}' },
            ],
            variables: { counter: '1' },
        },
    },

    'legacy-tags-and-nested-cbs': {
        preset: preset({
            promptTemplate: [
                main('<char> greets <user>. Persona: {{persona}} / Desc: {{description}}'),
                { type: 'description', innerFormat: '[<bot>]\n{{slot}}' },
                chat(),
                globalNote('Last user said: {{lastusermessage}} / last char: {{lastcharmessage}}'),
            ],
        }),
        character: card({
            description: '{{char}} serves {{user}}. {{#if 1}}Always kind.{{/if}}',
            personality: 'Likes <user>.',
        }),
        user: { name: 'Kim', persona: '{{user}} loves {{char}}' },
        chat: {
            messages: [
                { role: 'user', data: '<char>, hello from <user>' },
                { role: 'char', data: 'Hi <user>!' },
            ],
        },
    },

    'regex-order-and-cbs-output': {
        preset: preset({
            regex: [
                {
                    comment: 'second',
                    in: 'tea',
                    out: 'coffee',
                    type: 'editprocess',
                    flag: 'g<order 1>',
                    ableFlag: true,
                },
                {
                    comment: 'first',
                    in: 'water',
                    out: 'tea',
                    type: 'editprocess',
                    flag: 'g<order 5>',
                    ableFlag: true,
                },
                {
                    comment: 'capture into cbs',
                    in: 'name:(\\w+)',
                    out: '{{upper::$1}} for {{user}}',
                    type: 'editprocess',
                    flag: 'g',
                    ableFlag: true,
                },
                {
                    comment: 'flag ignored without ableFlag',
                    in: 'LOUD',
                    out: 'quiet',
                    type: 'editprocess',
                    flag: 'i',
                    ableFlag: false,
                },
                {
                    comment: 'move to top',
                    in: '\\[note\\]',
                    out: '@@move_top [moved note]',
                    type: 'editprocess',
                    flag: 'g',
                    ableFlag: true,
                },
                {
                    comment: 'display only',
                    in: 'coffee',
                    out: 'NOT IN PROMPT',
                    type: 'editdisplay',
                },
            ],
        }),
        character: card(),
        user,
        chat: {
            messages: [
                { role: 'user', data: 'water please, name:latte, loud LOUD' },
                { role: 'char', data: 'Here you go.\n[note]' },
            ],
        },
    },

    'thoughts-and-inlays': {
        preset: preset(),
        character: card(),
        user,
        chat: {
            messages: [
                { role: 'user', data: 'Look {{inlay::abc-123}} at this' },
                {
                    role: 'char',
                    data: '<Thoughts>\nI should be nice.\n</Thoughts>\nNice picture!{{inlayed::def-456}}',
                },
                { role: 'user', data: 'Thanks {{asset_prompt::icon}}' },
            ],
        },
    },

    'lorebook-search-rules': {
        preset: preset({
            promptTemplate: [
                main('Main. Custom position: {{position::cafe}}'),
                { type: 'description' },
                { type: 'lorebook' },
                chat(),
            ],
        }),
        character: card({
            character_book: characterBook([
                {
                    keys: ['latte'],
                    secondary_keys: ['please'],
                    selective: true,
                    content: 'Selective: latte AND please.',
                    comment: 'selective',
                },
                {
                    keys: ['latte'],
                    secondary_keys: ['decaf'],
                    selective: true,
                    content: 'Never: latte AND decaf.',
                    comment: 'selective-miss',
                },
                {
                    keys: ['latte'],
                    content: '@@exclude_keys please\nExcluded by please.',
                    comment: 'exclude',
                },
                {
                    keys: ['/thank(s)?/i'],
                    use_regex: true,
                    content: 'Regex matched thanks.',
                    comment: 'regex',
                },
                {
                    keys: ['oat'],
                    content: 'Recursive: triggered by another entry mentioning oat.',
                    comment: 'recursive',
                },
                {
                    keys: ['latte'],
                    content: 'Oat milk is the default.',
                    comment: 'oat-source',
                    insertion_order: 10,
                },
                {
                    constant: true,
                    content: '@@position pt_cafe\nPositioned into the main prompt.',
                    comment: 'pt',
                },
                {
                    constant: true,
                    content: '@@activate_only_after 10\nToo early.',
                    comment: 'late',
                },
                {
                    keys: ['latte'],
                    content: 'Card depth extension.',
                    comment: 'card-depth',
                    extensions: { position: 4, depth: 2, role: 1 },
                },
            ]),
        }),
        user,
        chat: {
            messages: [
                { role: 'user', data: 'One latte, please.' },
                { role: 'char', data: 'Coming right up.' },
                { role: 'user', data: 'Thanks!' },
            ],
        },
    },

    'lorebook-injection': {
        preset: preset({
            promptTemplate: [
                main('Main.'),
                { type: 'description', innerFormat: '<desc>{{slot}}</desc>' },
                { type: 'lorebook' },
                chat(),
            ],
        }),
        character: card({
            character_book: characterBook([
                { constant: true, content: 'Target lore.', comment: 'target' },
                {
                    constant: true,
                    content: '@@inject_lore target\nInjected into target.',
                    comment: 'injector',
                },
                {
                    constant: true,
                    content: '@@inject_at description\nAppended to the description format.',
                    comment: 'inject-at',
                },
                {
                    constant: true,
                    content: '@@depth 0\n@@role assistant\nAssistant post-everything lore.',
                    comment: 'post-assistant',
                },
                {
                    constant: true,
                    content: '@@reverse_depth 1\nReverse depth lore.',
                    comment: 'reverse',
                },
            ]),
        }),
        user,
        chat: shortChat,
    },

    'card-regex-and-depth-prompt': {
        preset: preset(),
        character: card({
            extensions: {
                depth_prompt: { depth: 1, prompt: 'Depth prompt for {{char}}.' },
                risuai: {
                    customScripts: [
                        {
                            comment: 'card regex',
                            in: 'please',
                            out: 'kindly',
                            type: 'editprocess',
                            flag: 'g',
                            ableFlag: true,
                        },
                    ],
                },
            },
        }),
        user,
        chat: shortChat,
    },

    'system-chat-with-examples': {
        preset: preset({
            promptSettings: {
                assistantPrefill: 'Sure,',
                postEndInnerFormat: '',
                sendChatAsSystem: true,
                sendName: true,
                utilOverride: false,
            },
            promptTemplate: [
                main('Main.'),
                chat(-1000, 'end'),
                { type: 'authornote', innerFormat: 'AN: {{slot}}', defaultText: 'Default note.' },
                { type: 'persona', innerFormat: 'P: {{slot}}', role2: 'user' },
            ],
        }),
        character: card({
            mes_example: '<START>\n{{user}}: Hi\n{{char}}: Hello there: friend',
        }),
        user: { name: 'Kim', persona: 'A regular.' },
        chat: shortChat,
    },

    'greeting-only-and-cot': {
        preset: preset({
            promptTemplate: [
                main('Main.'),
                chat(),
                { type: 'cot', type2: 'normal', text: 'Reason first.', role: 'system' },
                { type: 'postEverything' },
                globalNote('After post everything.'),
            ],
        }),
        character: card(),
        user,
        chat: { messages: [] },
        chainOfThought: true,
    },

    'no-greeting-korean': {
        preset: preset(),
        character: card({ first_mes: '', description: '{{char}}는 {{user}}에게 커피를 내린다.' }),
        user: { name: '민수' },
        chat: {
            messages: [
                { role: 'user', data: '안녕, {{char}}!' },
                { role: 'char', data: '어서 와, {{user}}.' },
            ],
        },
    },

    'cbs-blocks': {
        preset: preset({
            promptTemplate: [
                main(
                    [
                        '{{#each ["a","b","c"] as item}}- {{slot::item}}\n{{/each}}',
                        '{{#if {{greater::3::2}}}}',
                        '  greater',
                        '{{:else}}',
                        '  smaller',
                        '{{/if}}',
                        '{{#when::keep::1}}  kept  {{/when}}',
                        '{{#pure}}{{user}}{{/pure}}',
                        'tempvar={{settempvar::t::5}}{{tempvar::t}}',
                        'calc={{calc::(1+2)*3}}',
                        'round={{round::2.5}} floor={{floor::2.9}}',
                    ].join('\n'),
                ),
                chat(),
            ],
        }),
        character: card(),
        user,
        chat: shortChat,
    },

    'korean-history-trimming': {
        preset: preset(),
        character: card({
            description: '{{char}}는 동네 카페의 바리스타로, {{user}}와 오래 알고 지냈다.',
            first_mes: '어서 와, {{user}}. 오늘도 늘 마시던 걸로?',
            mes_example:
                '<START>\n{{user}}: 추천해 줄 만한 거 있어?\n{{char}}: 오늘은 하우스 블렌드가 좋아.\n<START>\n{{user}}: 디저트는?\n{{char}}: 크루아상이 막 나왔어.',
        }),
        user: { name: '민수' },
        chat: koreanChat,
        context: { maxContext: 420, maxResponse: 100 },
    },

    'korean-lorebook-token-budget': {
        preset: preset(),
        character: card({
            description: '{{char}}는 동네 카페의 바리스타다.',
            character_book: {
                ...characterBook([
                    {
                        constant: true,
                        content: '카페 이름은 달빛콩이고 골목 끝 이층 건물에 있다.',
                        comment: 'name',
                        insertion_order: 300,
                    },
                    {
                        constant: true,
                        content: '모든 라떼에는 귀리 우유를 쓰며 시럽은 직접 만든다.',
                        comment: 'milk',
                        insertion_order: 200,
                    },
                    {
                        constant: true,
                        content: '단골손님에게는 열 번째 음료를 무료로 준다.',
                        comment: 'coupon',
                        insertion_order: 100,
                    },
                ]),
                token_budget: 45,
            },
        }),
        user: { name: '민수' },
        chat: koreanChat,
    },
}

import type {
    MarkupCase,
    MessageCase,
    MessageScenario,
    DisplayCase,
} from '../../../scripts/pocketrisu-oracle/protocol'

// Ids are golden-file keys: keep them stable and unique. After adding or editing
// a case, regenerate the golden file with `bun run pocketrisu:golden` (web).

const markup = (id: string, input: string): MarkupCase => ({
    kind: 'markup',
    id: `markup/${id}`,
    input,
})

const message = (
    id: string,
    scenario: Partial<MessageScenario> & { text: string },
): MessageCase => {
    const { text, ...rest } = scenario
    const messages = rest.messages ?? [
        { role: 'user' as const, content: 'Hello there.' },
        { role: 'char' as const, content: text },
    ]
    return {
        kind: 'message',
        id: `message/${id}`,
        scenario: {
            userName: 'Mina',
            charName: 'Ari',
            index: messages.length - 1,
            ...rest,
            messages,
        },
    }
}

export const markupCases: MarkupCase[] = [
    // Plain text and line handling
    markup('empty', ''),
    markup('whitespace-only', '   \n  '),
    markup('single-line', 'Hello world.'),
    markup('soft-breaks', 'first line\nsecond line\nthird line'),
    markup('paragraphs', 'first paragraph\n\nsecond paragraph\n\n\n\nthird after gap'),
    markup('leading-trailing-space', '  padded text  \n'),
    markup('indented-not-code', '    four spaces stay text\n\tand a tab'),
    markup('korean', '안녕하세요. 오늘 날씨가 좋네요!\n그녀는 조용히 웃었다.'),
    markup('emoji-zero-width', 'smile 😀​ joiner 👩‍👩‍👧 end'),
    markup('crlf', 'windows\r\nline\r\n\r\nendings'),

    // Inline markdown
    markup('emphasis', '*italic* _also_ **bold** __bold__ ***both***'),
    markup('strikethrough', '~~gone~~ and ~single~'),
    markup('inline-code', 'use `const x = 1` and ``a ` b``'),
    markup('asterisk-actions', '*She tilts her head.* "Really?" *A pause.*'),
    markup('unbalanced-emphasis', '*open without close and **double'),
    markup('backslash-escapes', '\\*not italic\\* \\# not heading \\\\ backslash'),
    markup('html-entities', '&amp; &lt;tag&gt; &quot; &#39; &copy; &#x1F600; & bare'),
    markup('angle-brackets-text', 'a < b > c and 3 <4 and <notatag'),

    // Typographer and quotes (PocketRisu wraps quotes in <mark risu-mark>)
    markup('quotes-double', 'She said "hello there" quietly.'),
    markup('quotes-single', "He whispered 'not now' and left."),
    markup('quotes-curly-input', '“curly double” and ‘curly single’'),
    markup('quotes-apostrophe', "It's Mina's book, isn't it? Rock 'n' roll."),
    markup('quotes-nested', `"She said 'wait' to me"`),
    markup('quotes-multiline', '"first line\nsecond line"'),
    markup('quotes-unbalanced', 'an "open quote and a stray "'),
    markup('quotes-in-emphasis', '*"quoted action"* and **"strong quote"**'),
    markup('quotes-in-html-attribute', '<span title="a &quot;b&quot;">"text"</span>'),
    markup('typographer-replacements', '(c) (C) (r) (tm) +- ... ?.... !!!!! ,, -- ---'),

    // Block markdown
    markup('headings', '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n#no-space'),
    markup('setext-headings', 'Title\n=====\n\nSub\n---'),
    markup('unordered-list', '- one\n- two\n  - nested\n* star\n+ plus'),
    markup('ordered-list', '1. one\n2. two\n10. ten\n\n3) paren'),
    markup('blockquote', '> quoted line\n> continued\n>\n> > nested'),
    markup('horizontal-rules', 'above\n\n---\n\n***\n\n___\nbelow'),
    markup('table', '| a | b |\n|:--|--:|\n| 1 | 2 |\n| x | *y* |'),
    markup(
        'links',
        '[web](https://example.com) [plain](http://a.b) [rel](/path) [js](javascript:alert(1)) [mail](mailto:a@b.c)',
    ),
    markup('autolinks', '<https://example.com> and www.example.com and https://bare.example'),
    markup('reference-link', '[ref][1]\n\n[1]: https://example.com "Title"'),
    markup('markdown-image', '![alt text](https://example.com/a.png "title") ![rel](images/a.png)'),
    markup('hard-break', 'two spaces  \nand backslash\\\nend'),

    // Code fences (PocketRisu highlights these with highlight.js)
    markup('fence-js', '```js\nconst a = 1\nconsole.log(`x ${a}`)\n```'),
    markup('fence-python', '```python\ndef f(x):\n    return x * 2\n```'),
    markup('fence-no-lang', '```\nplain <b>code</b>\n```'),
    markup('fence-unknown-lang', '```brainfuck\n++[>+<-]\n```'),
    markup('fence-html', '```html\n<div class="a">x</div>\n```'),
    markup('fence-tilde', '~~~json\n{"a": [1, 2]}\n~~~'),
    markup('fence-risuerror', '```risuerror\nsomething failed\n```'),
    markup('fence-unclosed', '```ts\nconst open = true'),

    // Raw HTML
    markup('html-div-class', '<div class="status-box">HP: 10</div>'),
    markup('html-multiple-classes', '<div class="a  b x-risu-c hljs-d">x</div>'),
    markup('html-inline-style', '<span style="color: red; font-weight: bold">red</span>'),
    markup(
        'html-style-dangerous',
        '<div style="width: 10px; background: url(javascript:alert(1)); color: blue">x</div>',
    ),
    markup('html-script', 'before<script>alert(1)</script>after'),
    markup(
        'html-event-handlers',
        '<img src="https://e.com/a.png" onerror="alert(1)"><div onclick="x()" onmouseover="y()">hi</div>',
    ),
    markup(
        'html-iframe-youtube',
        '<iframe src="https://www.youtube.com/embed/abc" allowfullscreen frameborder="0"></iframe>',
    ),
    markup('html-iframe-other', '<iframe src="https://evil.example/"></iframe>'),
    markup(
        'html-links',
        '<a href="https://e.com">ext</a> <a href="/local">local</a> <a href="javascript:alert(1)">js</a> <a>none</a>',
    ),
    markup(
        'html-images',
        '<img src="https://e.com/a.png"><img src="a.png" loading="eager"><img src="data:image/png;base64,AAAA">',
    ),
    markup(
        'html-risu-controls',
        '<button risu-btn="choice^A">A</button><button risu-trigger="go" risu-id="x">B</button>',
    ),
    markup(
        'html-form-controls',
        '<input id="t" type="checkbox" checked><label for="t">Toggle</label><select><option>1</option></select>',
    ),
    markup('html-details', '<details open><summary>More</summary>hidden *text*</details>'),
    markup('html-table', '<table><tr><td>a</td><td>b</td></tr></table>'),
    markup('html-data-aria', '<div data-state="open" aria-label="box" role="note">x</div>'),
    markup(
        'html-custom-tags',
        '<x-em>custom</x-em> <font color="red">font</font> <center>c</center>',
    ),
    markup(
        'html-svg',
        '<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="red"/></svg>',
    ),
    markup('html-unclosed', '<div><span>unclosed <b>bold'),
    markup('html-comment', 'a<!-- secret -->b'),
    markup(
        'html-block-then-markdown',
        '<div>\n*not emphasized inside html block*\n</div>\n\n*emphasized after blank line*',
    ),
    markup('html-inline-markdown', 'text <b>bold *and italic*</b> more'),
    markup('html-br-variants', 'a<br>b<br/>c<br />d'),

    // CSS
    markup('style-simple', '<style>.box { color: red; }</style><div class="box">x</div>'),
    markup(
        'style-root-and-elements',
        '<style>:root { --c: red; } p, .a > .b { color: var(--c); }</style>text',
    ),
    markup('style-media', '<style>@media (max-width: 600px) { .m { display: none; } }</style>x'),
    markup(
        'style-keyframes',
        '<style>@keyframes spin { to { transform: rotate(360deg); } } .s { animation: spin 1s; }</style>x',
    ),
    markup(
        'style-import-data',
        '<style>@import url("data:text/css,body{}"); .a{color:red}</style>x',
    ),
    markup('style-javascript', '<style>.a { background: url(javascript:alert(1)); }</style>x'),
    markup('style-with-attributes', '<style type="text/css">.a { color: red; }</style>x'),
    markup(
        'style-multiline',
        '<style>\n.a {\n  color: red;\n}\n\n.b { color: blue; }\n</style>\n<div class="a b">x</div>',
    ),
    markup('style-invalid-css', '<style>.a { color: red</style>x'),
    markup('style-closing-tag-in-content', '<style>.a::after { content: "</style>"; }</style>x'),
    markup(
        'style-svg-data-uri',
        `<style>.i { background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'></svg>"); }</style>x`,
    ),
    markup('style-two-blocks', '<style>.a{color:red}</style>mid<style>.b{color:blue}</style>'),
    markup('risu-style-raw', `<risu-style>${hex('.a { color: red; }')}</risu-style>x`),
    markup('risu-style-invalid-hex', '<risu-style>zz</risu-style>x'),

    // PocketRisu-specific syntax
    markup('thoughts', '<Thoughts>inner reasoning</Thoughts>\nVisible answer.'),
    markup('thoughts-nested', '<Thoughts>a<Thoughts>b</Thoughts>c</Thoughts>done'),
    markup('thoughts-unclosed', '<Thoughts>never closed\nanswer'),
    markup('tool-call', '<tool_call>searchweb_search{}</tool_call>result'),
    markup('katex-inline', 'Energy: $$E = mc^2$$ done.'),
    markup('katex-invalid', 'Broken: $$\\frac{1}{$$ end'),
    markup('risu-escape-chars', 'braces x parens y lt  gt  colon  semi '),

    // Realistic roleplay output
    markup(
        'rp-narration',
        '*Ari leans against the window, watching the rain.*\n\n"You\'re late again," she says, not turning around. "Third time this week."\n\n*A small sigh.* \'Whatever,\' she thinks.',
    ),
    markup(
        'rp-status-panel',
        [
            '<style>',
            '.panel { border: 1px solid #888; padding: 8px; border-radius: 6px; }',
            '.panel .row { display: flex; justify-content: space-between; }',
            '</style>',
            '<div class="panel">',
            '<div class="row"><span>HP</span><span>80/100</span></div>',
            '<div class="row"><span>Mood</span><span>"Curious"</span></div>',
            '</div>',
            '',
            '"Shall we begin?" *She smiles.*',
        ].join('\n'),
    ),
    markup(
        'rp-mixed-blocks',
        '## Day 3\n\n> Diary entry\n\n- woke up\n- *met* "Mina"\n\n---\n\n```txt\nlog: ok\n```\n\nEnd.',
    ),
]

export const messageCases: MessageCase[] = [
    // CBS
    message('plain', { text: 'Just text, nothing special.' }),
    message('names', { text: '{{user}}, meet {{char}}. {{bot}} waves.' }),
    message('angle-names', { text: '<user> and <char> and <bot>.' }),
    message('chat-variables', {
        text: 'Mood: {{getvar::mood}}. Missing: {{getvar::nothing}}.',
        chatVariables: { mood: 'happy' },
    }),
    message('global-variables', {
        text: 'Season: {{getglobalvar::season}}.',
        globalVariables: { season: 'winter' },
    }),
    message('setvar-hidden', { text: 'Before{{setvar::seen::1}}After' }),
    message('if-true', { text: '{{#if 1}}shown{{/if}}{{#if 0}}hidden{{/if}}' }),
    message('if-variable', {
        text: '{{#if {{equal::{{getvar::mood}}::happy}}}}:){{/if}}',
        chatVariables: { mood: 'happy' },
    }),
    message('when-else', { text: '{{#when::0}}no{{:else}}yes{{/when}}' }),
    message('calc', { text: '{{? 1 + 2 * 3}} and {{calc::10/4}}' }),
    message('comment', { text: 'visible{{// hidden note}} text' }),
    message('comment-display', { text: 'before {{comment::shown in chat}} after' }),
    message('file-display', { text: 'see {{file::notes.txt::aGVsbG8=}} here' }),
    message('setvar-then-getvar', {
        text: '{{setvar::mood::sad}}{{getvar::mood}} {{addvar::count::1}}{{getvar::count}}',
        chatVariables: { mood: 'happy', count: '1' },
    }),
    message('escapes', { text: '{{bo}}x{{bc}} {{decbo}}y{{decbc}} a{{br}}b' }),
    message('message-index', { text: 'idx {{chat_index}} last {{lastmessageid}}' }),
    message('unknown-cbs', { text: 'keep {{definitely_not_a_function}} and {{ spaced }}' }),
    message('user-role', {
        text: '',
        messages: [{ role: 'user', content: 'I am {{user}}, talking to "{{char}}".' }],
    }),

    // Asset syntax resolves against the character, which has no assets here
    message('asset-cbs-missing', { text: 'before {{img::portrait}} {{emotion::happy}} after' }),
    message('asset-image-tag-missing', { text: 'before <img="portrait"> after' }),
    message('asset-inlay-missing', { text: 'look {{inlay::missing-id}} here {{inlayed::other}}' }),

    // editdisplay regex
    message('regex-simple', {
        text: 'The [[secret]] word.',
        regex: [{ in: '\\[\\[(.+?)\\]\\]', out: '<b>$1</b>' }],
    }),
    message('regex-flags', {
        text: 'Cat cat CAT',
        regex: [{ in: 'cat', out: 'dog', flag: 'gi' }],
    }),
    message('regex-no-global', {
        text: 'a a a',
        regex: [{ in: 'a', out: 'b', flag: 'i' }],
    }),
    message('regex-newline-token', {
        text: 'one|two|three',
        regex: [{ in: '\\|', out: '$n' }],
    }),
    message('regex-data-token', {
        text: 'wrap me',
        regex: [{ in: 'wrap me', out: '[{{data}}]' }],
    }),
    message('regex-html-trailing-newline', {
        text: 'STATUS then text',
        regex: [{ in: 'STATUS', out: '<div class="status">ok</div>' }],
    }),
    message('regex-no-end-nl', {
        text: 'STATUS then text',
        regex: [{ in: 'STATUS', out: '<div class="status">ok</div>', flag: 'g<no_end_nl>' }],
    }),
    message('regex-cbs-in-replacement', {
        text: 'NAME arrives.',
        regex: [{ in: 'NAME', out: '{{char}} ({{user}})' }],
    }),
    message('regex-matches-cbs-output', {
        text: '{{char}} smiles.',
        regex: [{ in: 'Ari', out: '<b>Ari</b>' }],
    }),
    message('regex-order', {
        text: 'x',
        regex: [
            { in: 'x', out: 'y', flag: 'g<order 1>' },
            { in: 'y', out: 'z', flag: 'g<order 2>' },
        ],
    }),
    message('regex-move-top', {
        text: 'body text\n[STATUS: ok]',
        regex: [{ in: '\\[STATUS: (.+?)\\]', out: '@@move_top <div class="st">$1</div>' }],
    }),
    message('regex-move-bottom-action', {
        text: '[NOTE] body text',
        regex: [{ in: '\\[NOTE\\]', out: '(note)', flag: 'g<move_bottom>' }],
    }),
    message('regex-cbs-pattern', {
        text: 'Hello Ari!',
        regex: [{ in: '{{char}}', out: 'ARI', flag: 'g<cbs>' }],
    }),
    message('regex-delete-all', {
        text: 'remove everything',
        regex: [{ in: '[\\s\\S]*', out: '' }],
    }),
    message('regex-style-output', {
        text: 'PANEL',
        regex: [
            {
                in: 'PANEL',
                out: '<style>.p{color:red}</style><div class="p">{{user}}</div>',
            },
        ],
    }),
    message('regex-quotes', {
        text: 'Ari: hello',
        regex: [{ in: '^(\\w+): (.+)$', out: '**$1**: "$2"', flag: 'gm' }],
    }),
    message('regex-invalid-pattern', {
        text: 'stays (unchanged)',
        regex: [{ in: '(unclosed', out: 'x' }],
    }),
]

export const parityCases: DisplayCase[] = [...markupCases, ...messageCases]

function hex(value: string): string {
    return Array.from(new TextEncoder().encode(value), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('')
}

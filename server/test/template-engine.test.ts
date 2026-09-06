import { describe, expect, test } from 'bun:test'

import { renderTemplate } from '../src/services/prompt/template-engine'

const context = {
    values: { user: 'Mina', char: 'Aria' },
    variables: { affinity: '7', route: 'moon' },
    globalVariables: { locale: 'ko' },
    toggles: { secret: true },
}

describe('safe template engine', () => {
    test('keeps a Response Template block selected by nested numeric CBS', () => {
        const source = `{{#if {{? {{getglobalvar::toggle_response_mode}}>=2}}}}
---

## Response Template

- Response must follow the template below:
{{/if}}`
        const result = renderTemplate(source, {
            values: {},
            variables: {},
            globalVariables: { toggle_response_mode: '3' },
            toggles: {},
        })

        expect(result.text).toContain('## Response Template')
        expect(result.warnings).toEqual([])
    })
    test('renders variables and nested condition blocks', () => {
        const result = renderTemplate(
            '{{#if {{not_equal::{{user}}::}}}}Hi {{user}} {{#when::{{and::{{greater::{{getvar::affinity}}::5}}::{{toggle::secret}}}}}}trusted{{:else}}guest{{/when}}{{:else}}unknown{{/if}}',
            context,
        )
        expect(result.text).toBe('Hi Mina trusted')
        expect(result.warnings).toEqual([])
    })

    test('runs stateful CBS variables in an isolated server render', () => {
        const result = renderTemplate('A {{setvar::x::1}}{{getvar::x}} B', context)
        expect(result.text).toBe('A 1 B')
        expect(result.warnings).toEqual([])
    })

    test('enforces output limits', () => {
        expect(() =>
            renderTemplate('12345', context, { maxDepth: 20, maxNodes: 10, maxOutputLength: 4 }),
        ).toThrow()
    })

    test('supports Risu legacy comparisons and safe string helpers', () => {
        const result = renderTemplate(
            '{{#if {{equal::{{getglobalvar::locale}}::ko}}}}{{upper::risu}}{{:else}}no{{/if}}',
            context,
        )
        expect(result.text).toBe('RISU')
    })

    test('supports #if_pure and Risu stack-style closing tags', () => {
        const result = renderTemplate(
            '{{#if true}}{{#if_pure true}}A{{/if_pure}}{{/if_pure}}-{{#if true}}B{{#if false}}hidden{{/13}}C{{/1}}{{/2}}{{/3}}',
            context,
        )

        expect(result.text).toBe('A-BC')
        expect(result.text).not.toContain('{{#if')
        expect(result.text).not.toContain('{{/')
    })

    test('supports nested CBS boolean helpers inside legacy expressions', () => {
        const result = renderTemplate(
            '{{#if {{? (0>=1) || ({{and::{{not_equal::::null}}::1}}})}}}}enabled{{/1}}{{#if {{? (0>=1) || ({{and::{{not_equal::::null}}::false}}})}}}}disabled{{/2}}',
            context,
        )

        expect(result.text).toBe('enabled')
    })

    test('ports Risu #each with arithmetic headers and compatibility slot syntax', () => {
        const result = renderTemplate(
            '{{#each {{? {{lastmessageid}}}} item}}[{{slot::item}}]{{/each}}',
            {
                ...context,
                messages: [
                    { role: 'user', content: 'one' },
                    { role: 'assistant', content: 'two' },
                    { role: 'user', content: 'three' },
                ],
            },
        )

        expect(result.text).toBe('[2]')
        expect(result.warnings).toEqual([])
    })

    test('supports nested Risu loops, range, arrays, and ::keep whitespace', () => {
        const result = renderTemplate(
            '{{#each::keep {{range::[0,2]}} as x}}{{#each::keep [3,4] as y}}{{slot::x}}{{slot::y}}\n{{/}}{{/}}',
            context,
        )

        expect(result.text).toBe('03\n04\n13\n14\n')
    })

    test('exposes server-side history CBS values', () => {
        const result = renderTemplate('{{lastmessageid}}:{{lastmessage}}:{{history::role}}', {
            ...context,
            messages: [
                { role: 'user', content: 'hello' },
                { role: 'assistant', content: 'world' },
            ],
        })

        expect(result.text).toBe('1:world:["user: hello","char: world"]')
    })

    test('supports Risu functions, calls, pure blocks, and escaped literals', () => {
        const result = renderTemplate(
            '{{#func greet who}}Hello {{arg::who}}{{/func}}{{call::greet::Mina}}|{{#pure}}{{user}}{{/pure}}|{{#escape::keep}}{{#if 1}}raw{{/}}{{/escape}}',
            context,
        )

        expect(result.text).toBe('Hello Mina|{{user}}|{{#if 1}}raw{{/}}')
    })

    test('matches Risu right-to-left #when operators and ::keep mode', () => {
        const result = renderTemplate(
            '{{#when::keep::1}} A {{:else}} B {{/}}{{#when::1::or::0::and::0}}C{{:else}}D{{/}}',
            context,
        )

        expect(result.text).toBe(' A C')
    })

    test('parses JSON object arguments and resolves server asset paths', () => {
        const result = renderTemplate(
            '{{dictelement::{"name":"Mina"}::name}}:{{asset::moon-background}}',
            {
                ...context,
                assets: [
                    {
                        name: 'moon-background',
                        type: 'image',
                        url: '/api/v1/assets/moon',
                    },
                ],
            },
        )

        expect(result.text).toBe('Mina:/api/v1/assets/moon')
    })

    test('renders PocketRisu media commands as chat markup in display mode', () => {
        const displayContext = {
            ...context,
            assetRenderMode: 'display' as const,
            assets: [
                {
                    name: 'surprised.1.webp',
                    type: 'x-risu-asset',
                    extension: 'webp',
                    url: '/api/v1/assets/surprised',
                },
            ],
        }

        expect(renderTemplate('{{img::surprised.1.webp}}', displayContext).text).toContain(
            '<img class="malang-message-image" src="/api/v1/assets/surprised"',
        )
        expect(renderTemplate('{{image::surprised.1.webp}}', displayContext).text).toContain(
            '<div class="risu-inlay-image">',
        )
        expect(renderTemplate('{{raw::surprised.1.webp}}', displayContext).text).toBe(
            '/api/v1/assets/surprised',
        )
    })

    // RisuAI's `tis`/`tisnot` compare the raw stored toggle value (a select toggle's chosen
    // index, say), not a boolean — collapsing it through `toggles` first would make a
    // multi-value toggle's `tis::2` unmatchable no matter what.
    test('tis/tisnot compare the raw toggle value, not its on/off boolean', () => {
        const withToggleValues = { ...context, toggleValues: { route: '2' } }
        const matched = renderTemplate(
            '{{#when::route::tis::2}}second{{:else}}other{{/when}}',
            withToggleValues,
        )
        expect(matched.text).toBe('second')

        const unmatched = renderTemplate(
            '{{#when::route::tisnot::2}}other{{:else}}second{{/when}}',
            withToggleValues,
        )
        expect(unmatched.text).toBe('second')
    })

    test('jbtoggled reflects the compiled jailbreakToggle value', () => {
        const result = renderTemplate('{{jbtoggled}}', { ...context, values: { jbtoggled: '1' } })
        expect(result.text).toBe('1')
    })
})

describe('Risu-compatible calc engine ({{? ...}} / {{calc::...}})', () => {
    // RisuAI's calc engine is a shunting-yard/RPN evaluator over single-char operators, not a
    // conventional parser. '=' and '>' are separate tokens, so a preset author's typo'd "a=>b"
    // (meant as ">=") silently parses as two chained comparisons and evaluates to 0 either way —
    // matching that exactly (rather than "fixing" it) is the point: it's what Risu itself does.
    test('parses "=>" as two chained single-char comparisons, not >=, on both sides', () => {
        const off = renderTemplate('{{? 0=>1}}', context)
        const on = renderTemplate('{{? 1=>1}}', context)
        expect(off.text).toBe('0')
        expect(on.text).toBe('0')
    })

    test('a toggle read through getglobalvar only gates content when compared correctly', () => {
        const template = '{{#if_pure {{? {{getglobalvar::toggle_x}}==1}}}}shown{{/if_pure}}'
        const off = renderTemplate(template, { ...context, globalVariables: { toggle_x: '0' } })
        const on = renderTemplate(template, { ...context, globalVariables: { toggle_x: '1' } })
        expect(off.text).toBe('')
        expect(on.text).toBe('shown')
    })

    test('supports basic arithmetic, parens, and >=/<=', () => {
        expect(renderTemplate('{{calc::2+3*4}}', context).text).toBe('14')
        expect(renderTemplate('{{calc::(2+3)*4}}', context).text).toBe('20')
        expect(renderTemplate('{{calc::5>=5}}', context).text).toBe('1')
        expect(renderTemplate('{{calc::4>=5}}', context).text).toBe('0')
    })
})

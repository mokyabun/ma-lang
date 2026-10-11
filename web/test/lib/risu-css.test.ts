import { describe, expect, test } from 'bun:test'

import { transformRisuCss } from '@/lib/risu-css'

describe('PocketRisu CSS isolation', () => {
    test('prefixes message classes once and scopes every selector below .chattext', () => {
        expect(transformRisuCss('.panel > .x-risu-bar, #id span { color: red }')).toBe(
            '.chattext .x-risu-panel > .x-risu-bar,.chattext #id span{color:red;}',
        )
    })

    test('maps :root to the chat scope under an optional root', () => {
        expect(transformRisuCss(':root { --accent: gold }', '#malang-chat-theme')).toBe(
            '#malang-chat-theme .chattext{--accent:gold;}',
        )
    })

    test('scopes rules nested in conditional at-rules but not keyframes', () => {
        expect(
            transformRisuCss(
                '@supports (display:grid) { @media print { .b { color: red } } }',
                '#r',
            ),
        ).toBe('@supports (display:grid){@media print{#r .chattext .x-risu-b{color:red;}}}')
        expect(transformRisuCss('@keyframes spin { from { opacity: 0 } }')).toBe(
            '@keyframes spin{from{opacity:0;}}',
        )
    })

    test('neutralizes data: imports', () => {
        expect(transformRisuCss('@import data:text/css,x;')).toBe('@import url("data:,");')
        expect(transformRisuCss('@import url("data:text/css,x");')).toBe('@import url("data:,");')
    })

    test('rejects script-capable or unparseable CSS', () => {
        expect(transformRisuCss('.a { background: url(javascript:alert(1)) }')).toBeUndefined()
        expect(transformRisuCss('.a { width: expression(1) }')).toBeUndefined()
        expect(transformRisuCss('.a { -moz-binding: url(x.xml) }')).toBeUndefined()
        expect(transformRisuCss('.a { color: red')).toBeUndefined()
    })
})

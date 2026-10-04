import { beforeAll, describe, expect, test } from 'bun:test'

import { Window } from 'happy-dom'

let sanitizeMessageHtml: (value: string) => string
let renderMessageHtml: (value: string) => string

beforeAll(async () => {
    const window = new Window({ url: 'https://malang.test/' })
    Object.assign(globalThis, {
        window,
        document: window.document,
        Node: window.Node,
        NodeFilter: window.NodeFilter,
        Element: window.Element,
        HTMLElement: window.HTMLElement,
        HTMLAnchorElement: window.HTMLAnchorElement,
        HTMLIFrameElement: window.HTMLIFrameElement,
    })
    ;({ sanitizeMessageHtml, renderMessageHtml } = await import('./sanitize-message-html'))
})

describe('PocketRisu-compatible message sanitizer', () => {
    test('keeps safe controls, Lua routing attributes, scoped CSS, and prefixed classes', () => {
        const output = sanitizeMessageHtml(`
            <style>.panel, .bar > label { width: 50%; }</style>
            <div class="panel" style="width: 75%; expression(alert(1))">
              <input id="toggle" type="checkbox">
              <label for="toggle">Open</label>
              <button risu-trigger="setChoiceFlag" risu-id="choice" onclick="alert(1)">Pick</button>
              <button risu-btn="choice^A">A</button>
              <script>alert(1)</script>
            </div>
        `)
        expect(output).toContain('.chattext .x-risu-panel')
        expect(output).toContain('.x-risu-bar')
        expect(output).toContain('class="x-risu-panel"')
        // Inline styles pass through as in PocketRisu; expression() only ever ran in old IE.
        expect(output).toContain('style="width: 75%; expression(alert(1))"')
        expect(output).toContain('type="checkbox"')
        expect(output).toContain('risu-trigger="setChoiceFlag"')
        expect(output).toContain('risu-id="choice"')
        expect(output).toContain('risu-btn="choice^A"')
        expect(output).not.toContain('onclick')
        expect(output).not.toContain('<script')
    })

    test('matches PocketRisu media, link, and iframe behavior', () => {
        const output = sanitizeMessageHtml(`
            <style>@import url(data:text/css,body{}); .ok { color: red; }</style>
            <a href="javascript:alert(1)">bad</a>
            <a href="https://example.com/path">good</a>
            <img src="https://example.com/panel.png">
            <audio controls src="https://example.com/theme.mp3"></audio>
            <iframe src="https://example.com/embed"></iframe>
            <iframe src="https://www.youtube.com/embed/video-id"></iframe>
        `)
        // PocketRisu only rewrites a bare `@import data:` rule, not url(data:...).
        expect(output).toContain('@import url(data:text/css,body{})')
        expect(output).toContain('.chattext .x-risu-ok')
        expect(output).not.toContain('javascript:')
        expect(output).toContain('target="_blank"')
        expect(output).toContain('https://example.com/panel.png')
        expect(output).toContain('loading="lazy"')
        expect(output).toContain('<audio')
        expect(output).not.toContain('https://example.com/embed')
        expect(output).toContain('https://www.youtube.com/embed/video-id')
    })

    test('renders raw HTML in ordinary chat and does not double-prefix PocketRisu classes', () => {
        const output = renderMessageHtml(`
            **선택 화면**
            <style>
              .sel-line span.x-risu-on-sel button:hover { background: #e8a33d !important; }
            </style>
            <div class="sel-line"><span class="x-risu-on-sel"><button risu-trigger="choose">선택</button></span></div>
        `)
        expect(output).toContain('<strong>선택 화면</strong>')
        expect(output).toContain('class="x-risu-sel-line"')
        expect(output).toContain('class="x-risu-on-sel"')
        expect(output).toContain('.chattext .x-risu-sel-line span.x-risu-on-sel button:hover')
        expect(output).not.toContain('x-risu-x-risu-on-sel')
        expect(output).toContain('risu-trigger="choose"')
    })

    test('preserves trusted Malang media classes while prefixing imported classes', () => {
        const output = sanitizeMessageHtml(
            '<div><img class="malang-message-image custom-image" src="/api/v1/assets/test"></div>',
        )
        expect(output).toContain('class="malang-message-image x-risu-custom-image"')
    })

    test('keeps a full-size PocketRisu panel stylesheet intact', () => {
        const rules = Array.from(
            { length: 40 },
            (_, index) =>
                `.panel-${index} span.x-risu-on-sel button:hover{display:flex;flex:1;background:radial-gradient(ellipse at top,#14160f 0%,#0b0d0a 60%)!important}`,
        ).join('\n')
        const output = sanitizeMessageHtml(
            `<style>${rules}</style><div class="panel-39"><span class="x-risu-on-sel"><button>선택</button></span></div>`,
        )
        expect(output).toContain('.chattext .x-risu-panel-0')
        expect(output).toContain('.chattext .x-risu-panel-39')
        expect(output).toContain('radial-gradient')
        expect(output).not.toContain('x-risu-x-risu-on-sel')
        expect(output).not.toContain('<span><style>')
    })
})

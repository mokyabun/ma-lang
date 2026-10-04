// Port of PocketRisu's chat markup stage (src/ts/parser/parser.svelte.ts):
// parseInlayAssets → parseThoughtsAndTools → encodeStyle → renderHighlightableMarkdown
// (ParseMarkdown in 'notrim' mode) followed by trimMarkdown, as ChatBody.svelte
// renders a message. Names and control flow follow the original so the two can be
// diffed side by side; PocketRisu settings read from DBState use their defaults.
//
// Deliberate differences, all invisible in the rendered message:
// - External links also get rel="noopener noreferrer".
// - <style> elements with attributes are scoped like plain <style> blocks instead
//   of being injected unscoped into the whole page.
// - `malang-` classes from Malang's own asset markup keep their names.
import css, { type CssAtRuleAST } from '@adobe/css-tools'
import DOMPurify, { type Config, type DOMPurify as Purifier } from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import cssLanguage from 'highlight.js/lib/languages/css'
import dart from 'highlight.js/lib/languages/dart'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import lua from 'highlight.js/lib/languages/lua'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import katex from 'katex'
import markdownit from 'markdown-it'
import cssSelectorParser from 'postcss-selector-parser'

// PocketRisu's English UI strings (src/lang/en.ts).
const language = {
    cot: 'Chain of Thoughts',
    error: 'Error',
    toolCalled: "Tool '{{tool}}' Called",
}

const markdownItOptions = {
    html: true,
    breaks: true,
    linkify: false,
    typographer: true,
    quotes: '\u{E9b0}\u{E9b1}\u{E9b2}\u{E9b3}', //placeholder characters to convert to real quotes
}

const md = markdownit(markdownItOptions)
const mdHighlight = markdownit({
    highlight: function (str, lang) {
        if (lang) {
            return `<pre-hljs-placeholder lang="${lang}">` + str + '</pre-hljs-placeholder>'
        }
        return ''
    },
    ...markdownItOptions,
})

md.disable(['code'])
mdHighlight.disable(['code'])

// PocketRisu imports these on first use; registering them up front keeps rendering synchronous.
const highlightLanguages = {
    bash,
    cpp,
    csharp,
    css: cssLanguage,
    dart,
    xml,
    java,
    javascript,
    json,
    lua,
    markdown,
    python,
    rust,
    shell,
    typescript,
    plaintext,
    yaml,
}
for (const [name, definition] of Object.entries(highlightLanguages)) {
    hljs.registerLanguage(name, definition)
}

const trimPurifyConfig: Config = {
    ADD_TAGS: [
        'iframe',
        'style',
        'risu-style',
        'x-em',
        'annotation',
        'semantics',
        'mrow',
        'mi',
        'mo',
        'mn',
        'msup',
        'msub',
        'mfrac',
        'msqrt',
    ],
    ADD_ATTR: [
        'allow',
        'allowfullscreen',
        'frameborder',
        'scrolling',
        'risu-ctrl',
        'risu-btn',
        'risu-trigger',
        'risu-mark',
        'risu-id',
        'x-hl-lang',
        'x-hl-text',
        'data-inlay-id',
        'data-inlay-type',
        'data-inlay-pending',
    ],
}

let purifier: Purifier | undefined

/**
 * PocketRisu installs its hooks on the shared DOMPurify instance. Malang keeps them on
 * a dedicated instance, created on first use so it binds to the current window.
 */
function getPurifier(): Purifier {
    if (purifier) return purifier
    const instance = DOMPurify(window)

    instance.addHook('uponSanitizeElement', (target, data) => {
        if (!('getAttribute' in target)) return
        const node = target as Element
        if (data.tagName === 'iframe') {
            const src = node.getAttribute('src') || ''
            if (!src.startsWith('https://www.youtube.com/embed/')) {
                node.parentNode?.removeChild(node)
                return
            }
        }
        if (data.tagName === 'img') {
            const loading = node.getAttribute('loading')
            if (!loading) {
                node.setAttribute('loading', 'lazy')
            }
            const decoding = node.getAttribute('decoding')
            if (!decoding) {
                node.setAttribute('decoding', 'async')
            }
        }
    })

    instance.addHook('uponSanitizeAttribute', (node, data) => {
        switch (data.attrName) {
            case 'class': {
                if (data.attrValue) {
                    data.attrValue = data.attrValue
                        .split(' ')
                        .map((v) => {
                            if (v.startsWith('hljs')) {
                                return v
                            }
                            if (v.startsWith('x-risu-')) {
                                return v
                            }
                            if (v.startsWith('malang-')) {
                                return v
                            }
                            return 'x-risu-' + v
                        })
                        .join(' ')
                }
                break
            }
            case 'href': {
                if (data.attrValue.startsWith('http://') || data.attrValue.startsWith('https://')) {
                    node.setAttribute('target', '_blank')
                    node.setAttribute('rel', 'noopener noreferrer')
                    break
                }
                data.attrValue = ''
                break
            }
        }
    })

    instance.addHook('uponSanitizeAttribute', (node, data) => {
        if (
            ['IMG', 'SOURCE', 'VIDEO', 'AUDIO', 'STYLE'].includes(node.nodeName) &&
            data.attrName === 'src'
        ) {
            if (data.attrValue.startsWith('blob:')) {
                data.forceKeepAttr = true
            }
        }
    })

    purifier = instance
    return instance
}

const replacements = [
    '{', //0xE9B8
    '}', //0xE9B9
    '(', //0xE9BA
    ')', //0xE9BB
    '&lt;', //0xE9BC
    '&gt;', //0xE9BD
    ':', //0xE9BE
    ';', //0xE9BF
]

export function risuUnescape(text: string) {
    return text.replace(/[-]/g, (f) => {
        const index = f.charCodeAt(0) - 0xe9b8
        return replacements[index]!
    })
}

function renderMarkdown(md: markdownit, data: string) {
    const quotes = ['“', '”', '‘', '’']
    data = data.replace(/\$\$(.*?)\$\$/gs, (match: string, content: string) => {
        try {
            content = content
                .replace(//gu, '{')
                .replace(//gu, '}')
                .replace(//gu, '(')
                .replace(//gu, ')')
            const rendered = katex.renderToString(content, {
                displayMode: false,
                throwOnError: true,
                output: 'mathml',
            })
            return rendered
        } catch {
            return match
        }
    })
    let text = risuUnescape(md.render(data.replace(/“|”/g, '"').replace(/‘|’/g, "'")))

    text = text
        .replace(//gu, '<mark risu-mark="quote2">' + quotes[0])
        .replace(//gu, quotes[1] + '</mark>')
    text = text
        .replace(//gu, '<mark risu-mark="quote1">' + quotes[2])
        .replace(//gu, quotes[3] + '</mark>')

    return text
}

function highlightTarget(lang: string): { lang: string; fileExt: string } {
    switch (lang) {
        case 'bash':
            return { fileExt: 'sh', lang: 'bash' }
        case 'c':
        case 'cpp':
            return { fileExt: lang, lang: 'cpp' }
        case 'cs':
        case 'csharp':
            return { fileExt: 'cs', lang: 'csharp' }
        case 'css':
            return { fileExt: 'css', lang: 'css' }
        case 'dart':
            return { fileExt: 'dart', lang: 'dart' }
        case 'html':
        case 'svg':
        case 'xml':
            return { fileExt: lang, lang: 'xml' }
        case 'java':
            return { fileExt: 'java', lang: 'java' }
        case 'js':
        case 'jsx':
        case 'javascript':
            return { fileExt: 'js', lang: 'javascript' }
        case 'json':
            return { fileExt: 'json', lang: 'json' }
        case 'lua':
            return { fileExt: 'lua', lang: 'lua' }
        case 'markdown':
        case 'md':
            return { fileExt: 'md', lang: 'markdown' }
        case 'py':
        case 'python':
            return { fileExt: 'py', lang: 'python' }
        case 'rust':
            return { fileExt: 'rs', lang: 'rust' }
        case 'shell':
            return { fileExt: 'sh', lang: 'shell' }
        case 'ts':
        case 'tsx':
        case 'typescript':
            return { fileExt: 'ts', lang: 'typescript' }
        case 'txt':
        case 'vtt':
            return { fileExt: lang, lang: 'plaintext' }
        case 'yaml':
            return { fileExt: 'yml', lang: 'yaml' }
        case 'risuerror':
            return { lang: 'error', fileExt: 'error' }
        default:
            return { lang: 'none', fileExt: 'none' }
    }
}

function renderHighlightableMarkdown(data: string) {
    let rendered = renderMarkdown(mdHighlight, data)
    const highlightPlaceholders = rendered.match(
        /<pre-hljs-placeholder lang="(.+?)">(.+?)<\/pre-hljs-placeholder>/gms,
    )
    if (!highlightPlaceholders) {
        return rendered
    }

    for (const placeholder of highlightPlaceholders) {
        try {
            const sourceLang = placeholder.match(/lang="(.+?)"/)?.[1]
            const code = placeholder.match(
                /<pre-hljs-placeholder lang=".+?">(.+?)<\/pre-hljs-placeholder>/ms,
            )?.[1]
            if (!sourceLang || !code) {
                continue
            }
            const { lang, fileExt } = highlightTarget(sourceLang)
            if (lang === 'none') {
                rendered = rendered.replace(
                    placeholder,
                    `<pre><code>${md.utils.escapeHtml(code)}</code></pre>`,
                )
            } else if (lang === 'error') {
                rendered = rendered.replace(
                    placeholder,
                    `<div class="risu-error"><h1>${language.error}</h1>${md.utils.escapeHtml(code)}</div>`,
                )
            } else {
                const highlighted = hljs.highlight(code, {
                    language: lang,
                    ignoreIllegals: true,
                }).value
                rendered = rendered.replace(
                    placeholder,
                    `<pre class="hljs" x-hl-lang="${fileExt}"><code>${highlighted}</code></pre>`,
                )
            }
        } catch {
            // PocketRisu leaves the placeholder for the sanitizer to drop.
        }
    }

    return rendered
}

/** PocketRisu's initial inlay markup; MessageContent resolves the placeholders after render. */
export function parseInlayAssets(data: string) {
    const inlayMatch = data.match(/{{(inlay|inlayed|inlayeddata)::(.+?)}}/g)
    if (inlayMatch) {
        for (const inlay of inlayMatch) {
            const inlayType = inlay.startsWith('{{inlayed') ? 'inlayed' : 'inlay'
            const id = inlay.substring(inlay.indexOf('::') + 2, inlay.length - 2)
            const prefix = inlayType !== 'inlay' ? `<div class="risu-inlay-image">` : ''
            const postfix = inlayType !== 'inlay' ? `</div>\n\n` : ''
            const placeholder = `${prefix}<div data-inlay-id="${id}" data-inlay-type="${inlayType}" class="risu-inlay-placeholder risu-loading-spinner" style="width: 100%; min-height: 100px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.1); border-radius: 8px;"></div>${postfix}`
            data = data.replace(inlay, placeholder)
        }
    }
    return data
}

function parseThoughtsAndTools(data: string) {
    let result = '',
        i = 0
    while (i < data.length) {
        if (data.slice(i, i + 10) === '<Thoughts>') {
            let j = i + 10,
                depth = 1
            while (j < data.length && depth > 0) {
                if (data.slice(j, j + 10) === '<Thoughts>') depth++
                if (data.slice(j, j + 11) === '</Thoughts>') depth--
                j++
            }
            if (depth === 0) {
                result += `<details><summary>${language.cot}</summary>${data.substring(i + 10, j - 1)}</details>`
                i = j + 10
                continue
            }
        }
        result += data[i++]
    }
    return result.replace(/<tool_call>(.+?)<\/tool_call>/gms, (_full, txt: string) => {
        return `<div class="x-risu-tool-call">🛠️ ${language.toolCalled.replace('{{tool}}', txt.split('')?.[1] ?? 'unknown')}</div>\n\n`
    })
}

/** ParseMarkdown's markup stage plus trimMarkdown, for text that already passed CBS and regex. */
export function renderPocketRisuMarkup(data: string): string {
    data = parseInlayAssets(data ?? '')
    data = parseThoughtsAndTools(data)
    data = encodeStyle(data)
    data = renderHighlightableMarkdown(data)
    return trimMarkdown(data)
}

export function trimMarkdown(data: string) {
    if (!data) {
        return ''
    }
    // Without a <risu-style> there is nothing to decode, so the plain string
    // result is already final.
    if (!data.includes('<risu-style')) {
        return getPurifier().sanitize(data, trimPurifyConfig)
    }

    // Decoded CSS never goes back through the HTML sanitizer: DOMPurify drops
    // style nodes whose CSS contains '<'. The <risu-style> elements of the
    // sanitized tree are swapped for real <style> elements in place instead.
    const root = getPurifier().sanitize(data, {
        ...trimPurifyConfig,
        RETURN_DOM: true,
    }) as HTMLElement | null
    if (!root) {
        return ''
    }

    for (const el of Array.from(root.querySelectorAll('risu-style'))) {
        const decoded = decodeStyleContent(el.textContent ?? '')
        if (decoded.css === undefined) {
            el.replaceWith(root.ownerDocument.createTextNode(decoded.fallback ?? ''))
            continue
        }
        const style = root.ownerDocument.createElement('style')
        // <style> is RAWTEXT, so '</style' is the only sequence that can end the
        // block early once this string is parsed again.
        style.textContent = decoded.css.replaceAll(/<\/(?=style)/gi, '<\\/')
        el.replaceWith(style)
    }

    return root.innerHTML
}

// PocketRisu matches only a bare <style>; Malang also scopes <style> with attributes.
const styleRegex = /<style(?:\s[^>]*)?>(.+?)<\/style>/gms
export function encodeStyle(txt: string) {
    return txt.replaceAll(styleRegex, (_f, c1: string) => {
        return '<risu-style>' + utf8ToHex(c1) + '</risu-style>'
    })
}

function decodeStyleRule(rule: CssAtRuleAST) {
    if (rule.type === 'rule') {
        if (rule.selectors) {
            for (let i = 0; i < rule.selectors.length; i++) {
                let slt = rule.selectors[i]
                if (slt) {
                    const parser = cssSelectorParser((root) => {
                        root.walkClasses((classes) => {
                            if (classes.type === 'class' && !classes.value.startsWith('x-risu-')) {
                                classes.value = 'x-risu-' + classes.value
                            }
                        })
                    })

                    slt = parser.processSync(slt)

                    rule.selectors[i] = '.chattext ' + slt
                }
            }
        }
    }
    if (
        rule.type === 'media' ||
        rule.type === 'supports' ||
        rule.type === 'document' ||
        rule.type === 'host' ||
        rule.type === 'container'
    ) {
        for (let i = 0; i < rule.rules.length; i++) {
            rule.rules[i] = decodeStyleRule(rule.rules[i]!)
        }
    }
    if (rule.type === 'import') {
        if (rule.import.startsWith('data:')) {
            rule.import = 'data:,'
        }
    }
    return rule
}

/**
 * Decodes one <risu-style> body into scoped CSS. On a CSS parse error the style
 * is dropped and `fallback` holds PocketRisu's default "CSS ERROR" text.
 */
function decodeStyleContent(hexText: string): { css?: string; fallback?: string } {
    try {
        const text = hexToUtf8(hexText)
        const ast = css.parse(text)
        const rules = ast?.stylesheet?.rules
        if (rules) {
            for (let i = 0; i < rules.length; i++) {
                rules[i] = decodeStyleRule(rules[i]!)
            }
            ast.stylesheet.rules = rules
        }
        return {
            css: css.stringify(ast, {
                indent: '',
                compress: true,
            }),
        }
    } catch (error) {
        return { fallback: `CSS ERROR: ${String(error)}` }
    }
}

function utf8ToHex(value: string): string {
    let hex = ''
    for (const byte of new TextEncoder().encode(value)) hex += byte.toString(16).padStart(2, '0')
    return hex
}

/** Node's Buffer.from(hex, 'hex'): decodes byte pairs up to the first invalid one. */
function hexToUtf8(hex: string): string {
    const bytes: number[] = []
    for (let index = 0; index + 1 < hex.length; index += 2) {
        const pair = hex.slice(index, index + 2)
        if (!/^[0-9a-f]{2}$/i.test(pair)) break
        bytes.push(Number.parseInt(pair, 16))
    }
    return new TextDecoder().decode(new Uint8Array(bytes))
}

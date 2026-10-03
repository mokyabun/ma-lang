// Cases where Malang's rendering is known to differ from PocketRisu. They still
// run as `test.failing`: each must keep differing, so fixing one turns its test
// red until its entry is removed here. PARITY_STRICT=1 ignores this list and
// runs every case as a plain equality test.

const QUOTE_MARKS = 'Quotes are not wrapped in <mark risu-mark="quote1|quote2">'
const HIGHLIGHT = 'Code fences are not rendered through highlight.js (<pre class="hljs" x-hl-lang>)'
const LINK_REL = 'Malang adds rel="noopener noreferrer" to external links'
const EMPTY_FALLBACK = 'MessageContent shows the raw stored text when the rendered HTML is empty'
const CSS_ERROR = 'Invalid CSS is dropped instead of showing PocketRisu\'s "CSS ERROR:" text'

export const KNOWN_DEVIATIONS: Record<string, string> = {
    // Markdown rendering features
    'markup/asterisk-actions': QUOTE_MARKS,
    'markup/quotes-double': QUOTE_MARKS,
    'markup/quotes-single': QUOTE_MARKS,
    'markup/quotes-curly-input': QUOTE_MARKS,
    'markup/quotes-apostrophe': QUOTE_MARKS,
    'markup/quotes-nested': QUOTE_MARKS,
    'markup/quotes-multiline': QUOTE_MARKS,
    'markup/quotes-in-emphasis': QUOTE_MARKS,
    'markup/quotes-in-html-attribute': QUOTE_MARKS,
    'markup/rp-narration': QUOTE_MARKS,
    'markup/rp-status-panel': QUOTE_MARKS,
    'markup/rp-mixed-blocks': `${QUOTE_MARKS}; ${HIGHLIGHT}`,
    'message/user-role': QUOTE_MARKS,
    'message/regex-quotes': QUOTE_MARKS,
    'markup/fence-js': HIGHLIGHT,
    'markup/fence-python': HIGHLIGHT,
    'markup/fence-html': HIGHLIGHT,
    'markup/fence-tilde': HIGHLIGHT,
    'markup/fence-unclosed': HIGHLIGHT,
    'markup/fence-unknown-lang': 'Unknown fence languages keep a language-* class',
    'markup/fence-risuerror': '```risuerror is not rendered as a risu-error box',
    'markup/thoughts': '<Thoughts> is not converted to <details><summary>',
    'markup/thoughts-nested': '<Thoughts> is not converted to <details><summary>',
    'markup/tool-call': '<tool_call> is not converted to a tool-call notice',
    'markup/katex-inline': '$$…$$ is not rendered with KaTeX',
    'markup/risu-escape-chars': 'PocketRisu escape characters U+E9B8–U+E9BF are not unescaped',

    // Sanitizer policy
    'markup/links': LINK_REL,
    'markup/autolinks': LINK_REL,
    'markup/reference-link': LINK_REL,
    'markup/html-links': `${LINK_REL}; javascript: hrefs are removed instead of emptied`,
    'markup/html-iframe-youtube': 'Malang adds referrerpolicy="no-referrer" to iframes',
    'markup/html-iframe-other': `${EMPTY_FALLBACK} (the stripped iframe markup becomes visible)`,
    'markup/html-multiple-classes': 'Empty class tokens are dropped instead of becoming "x-risu-"',
    'markup/html-style-dangerous': 'Inline style declarations with javascript: are removed',

    // Scoped CSS
    'markup/style-root-and-elements': ':root maps to .chattext instead of ".chattext :root"',
    'markup/style-import-data': '@import data: URLs are replaced with url("data:,")',
    'markup/style-javascript': 'Style blocks containing javascript: are dropped',
    'markup/style-with-attributes':
        '<style> with attributes is scoped instead of passed through unscoped',
    'markup/style-invalid-css': CSS_ERROR,
    'markup/style-closing-tag-in-content': CSS_ERROR,
    'markup/risu-style-invalid-hex':
        'Undecodable <risu-style> is removed instead of left as an empty <style>',

    // Empty output
    'markup/whitespace-only': EMPTY_FALLBACK,
    'message/regex-delete-all': EMPTY_FALLBACK,

    // CBS and editdisplay pipeline
    'message/angle-names':
        '<user>, <char> and <bot> are not rewritten to {{user}}/{{char}}/{{bot}}',
    'message/chat-variables': 'Missing variables render as "" instead of "null"',
    'message/regex-matches-cbs-output':
        'Regex runs before CBS; PocketRisu evaluates CBS first, then regex',
    'message/asset-image-tag-missing':
        '<img="name"> without a matching asset is removed instead of kept as text',
    'message/asset-inlay-missing': '{{inlay::id}} is not rendered as an inlay placeholder',
}

// Both renderers' strings end up as innerHTML of the message element, so the
// comparison is over the DOM a browser builds from them. The only normalization
// is attribute order, which cannot change rendering; text, whitespace, tags and
// attribute values must match exactly.

const VOID_ELEMENTS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr',
])

/** Requires a DOM (installHappyDom). */
export function canonicalHtml(html: string): string {
    const template = document.createElement('template')
    template.innerHTML = html
    return serializeChildren(template.content)
}

function serializeChildren(parent: Node): string {
    let output = ''
    for (const child of Array.from(parent.childNodes)) output += serializeNode(child)
    return output
}

function serializeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentNode as Element | null
        const raw = parent && ['STYLE', 'SCRIPT'].includes(parent.nodeName)
        return raw ? (node.textContent ?? '') : escapeText(node.textContent ?? '')
    }
    if (node.nodeType === Node.COMMENT_NODE) return `<!--${node.textContent ?? ''}-->`
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const element = node as Element
    const tag = element.localName
    const attributes = Array.from(element.attributes)
        .map((attribute) => `${attribute.name}="${escapeAttribute(attribute.value)}"`)
        .sort()
    const open = `<${[tag, ...attributes].join(' ')}>`
    if (VOID_ELEMENTS.has(tag)) return open
    const content =
        tag === 'template'
            ? serializeChildren((element as HTMLTemplateElement).content)
            : serializeChildren(element)
    return `${open}${content}</${tag}>`
}

function escapeText(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll(' ', '&nbsp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll(' ', '&nbsp;').replaceAll('"', '&quot;')
}

import {
    illustrationToken,
    illustrationTokenPattern,
    stripIllustrationTokens,
} from '@malang/shared'

export interface Paragraph {
    /** Counted from 1, as the analysis AI sees it. */
    index: number
    start: number
    end: number
    text: string
}

const BLANK_LINE = /\n[ \t]*\n\s*/g

function isTokenOnly(text: string): boolean {
    return !text.replace(illustrationTokenPattern(), '').trim()
}

/** Paragraphs separated by blank lines; blocks holding only illustration tokens are skipped. */
export function splitParagraphs(content: string): Paragraph[] {
    const paragraphs: Paragraph[] = []
    let start = 0
    const push = (end: number) => {
        const raw = content.slice(start, end)
        const leading = raw.length - raw.trimStart().length
        const text = raw.trim()
        if (text && !isTokenOnly(text)) {
            paragraphs.push({
                index: paragraphs.length + 1,
                start: start + leading,
                end: start + leading + text.length,
                text,
            })
        }
    }
    for (const match of content.matchAll(BLANK_LINE)) {
        push(match.index)
        start = match.index + match[0].length
    }
    push(content.length)
    return paragraphs
}

/** Text for the analysis AI: no tokens, markup or excess whitespace. */
export function plainText(content: string, maxLength: number): string {
    const text = stripIllustrationTokens(content)
        .replace(/\{\{(?:inlay|inlayed|inlayeddata)::[^}]*\}\}/g, '')
        .replace(/<(?:style|script)\b[\s\S]*?<\/(?:style|script)>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/** Inserts each token as its own block right after the given paragraph. */
export function insertTokens(
    content: string,
    inserts: Array<{ paragraph: number; id: string }>,
): string {
    const paragraphs = splitParagraphs(content)
    const ordered = [...inserts].sort((left, right) => right.paragraph - left.paragraph)
    let next = content
    for (const insert of ordered) {
        const paragraph = paragraphs[insert.paragraph - 1]
        if (!paragraph) throw new Error(`Paragraph ${insert.paragraph} does not exist`)
        next = `${next.slice(0, paragraph.end)}\n\n${illustrationToken(insert.id)}${next.slice(paragraph.end)}`
    }
    return next
}

/** Removes the given illustration tokens and the blank-line blocks they sat in. */
export function removeTokens(content: string, ids: Set<string>): string {
    const block = new RegExp(
        String.raw`\n*[ \t]*\{\{illustration::([^{}\s]+)\}\}[ \t]*(?=\n|$)`,
        'g',
    )
    return content.replace(block, (match, id: string) => (ids.has(id) ? '' : match))
}

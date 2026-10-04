import { encodeStyle, renderPocketRisuMarkup, trimMarkdown } from './pocketrisu/markdown'

/** Render chat text exactly as PocketRisu's ParseMarkdown + trimMarkdown would. */
export function renderMessageHtml(value: string): string {
    return renderPocketRisuMarkup(value)
}

/** Sanitize an already-rendered HTML fragment with PocketRisu's trimMarkdown policy. */
export function sanitizeMessageHtml(value: string): string {
    return trimMarkdown(encodeStyle(value))
}

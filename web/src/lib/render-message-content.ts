import { expandMessageImages, type MessageImageAsset } from './message-images'
import { renderMessageHtml } from './sanitize-message-html'

/** HTML for a message's `.chattext` body; empty when the transcript shows the raw text instead. */
export function renderMessageContentHtml(
    source: string,
    imageAssets: MessageImageAsset[],
    seed: string,
): string {
    const expanded = expandMessageImages(source, imageAssets, seed)
    return expanded ? renderMessageHtml(expanded) : ''
}

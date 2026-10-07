import {
    expandMessageImages,
    type IllustrationView,
    type MessageImageAsset,
} from './message-images'
import { renderMessageHtml } from './sanitize-message-html'

/** HTML for a message's `.chattext` body; empty when the transcript shows the raw text instead. */
export function renderMessageContentHtml(
    source: string,
    imageAssets: MessageImageAsset[],
    seed: string,
    illustrations?: ReadonlyMap<string, IllustrationView>,
): string {
    const expanded = expandMessageImages(source, imageAssets, seed, illustrations)
    return expanded ? renderMessageHtml(expanded) : ''
}

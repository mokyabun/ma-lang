// Port of PocketRisu's resolveInlayPlaceholders/processInlayQueue: after a message is
// rendered, each inlay placeholder from parseInlayAssets is swapped for its media.
// PocketRisu fetches inlays from its own storage; in Malang they are stored assets
// named after the PocketRisu inlay id (imports) or referenced by asset id (Lua).
import { assetUrl } from '../api'

export interface InlayAsset {
    assetId: string
    name: string
    mimeType: string
}

export function resolveInlayPlaceholders(root: HTMLElement, assets: InlayAsset[]) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-inlay-id]'))) {
        const id = el.getAttribute('data-inlay-id') ?? ''
        const asset =
            assets.find((item) => item.assetId === id) ?? assets.find((item) => item.name === id)
        if (!asset) {
            el.replaceWith(createMissingInlayPlaceholder(id))
            continue
        }
        const url = assetUrl(asset.assetId)
        if (asset.mimeType.startsWith('video/')) {
            el.replaceWith(createMediaElement('video', url, 'video/mp4'))
        } else if (asset.mimeType.startsWith('audio/')) {
            el.replaceWith(createMediaElement('audio', url, 'audio/mpeg'))
        } else {
            const img = document.createElement('img')
            img.src = url
            img.style.animation = 'risu-fade-in 0.3s ease-out'
            el.replaceWith(img)
        }
    }
}

function createMediaElement(tag: 'video' | 'audio', url: string, type: string) {
    const media = document.createElement(tag)
    media.controls = true
    const source = document.createElement('source')
    source.src = url
    source.type = type
    media.appendChild(source)
    return media
}

function createMissingInlayPlaceholder(id: string): HTMLDivElement {
    const box = document.createElement('div')
    box.className = 'risu-inlay-missing'
    box.setAttribute('data-missing-inlay-id', id)

    const title = document.createElement('div')
    title.className = 'risu-inlay-missing-title'
    title.textContent = 'Image unavailable'

    const subtitle = document.createElement('div')
    subtitle.className = 'risu-inlay-missing-subtitle'
    subtitle.textContent = id

    box.appendChild(title)
    box.appendChild(subtitle)
    return box
}

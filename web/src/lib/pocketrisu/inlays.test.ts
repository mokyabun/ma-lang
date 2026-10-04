import { beforeAll, describe, expect, test } from 'bun:test'

import { Window } from 'happy-dom'

let renderMessageHtml: (value: string) => string
let resolveInlayPlaceholders: typeof import('./inlays').resolveInlayPlaceholders

beforeAll(async () => {
    const window = new Window({ url: 'https://malang.test/' })
    Object.assign(globalThis, { window, document: window.document })
    ;({ renderMessageHtml } = await import('../sanitize-message-html'))
    ;({ resolveInlayPlaceholders } = await import('./inlays'))
})

const assets = [
    { assetId: 'asset-1', name: 'pocketrisu-inlay-id', mimeType: 'image/png' },
    { assetId: 'asset-2', name: 'clip', mimeType: 'video/mp4' },
]

function render(text: string) {
    const root = document.createElement('div')
    root.innerHTML = renderMessageHtml(text)
    resolveInlayPlaceholders(root, assets)
    return root
}

describe('inlay placeholders', () => {
    test('resolve imported inlays by name and Lua inlays by asset id', () => {
        const root = render('{{inlay::pocketrisu-inlay-id}} and {{inlay::asset-2}}')
        expect(root.querySelector('[data-inlay-id]')).toBeNull()
        expect(root.querySelector('img')?.getAttribute('src')).toBe('/api/v1/assets/asset-1')
        expect(root.querySelector('video source')?.getAttribute('src')).toBe(
            '/api/v1/assets/asset-2',
        )
    })

    test('keep the styled wrapper of {{inlayed}}', () => {
        const root = render('{{inlayed::pocketrisu-inlay-id}}')
        expect(root.querySelector('.x-risu-risu-inlay-image > img')).not.toBeNull()
    })

    test('show PocketRisu’s unavailable box for an unknown inlay', () => {
        const root = render('{{inlay::gone}}')
        const missing = root.querySelector('.risu-inlay-missing')
        expect(missing?.getAttribute('data-missing-inlay-id')).toBe('gone')
        expect(missing?.textContent).toBe('Image unavailablegone')
    })
})

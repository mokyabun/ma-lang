import { describe, expect, test } from 'bun:test'

import { expandMessageImages, type MessageImageAsset } from './message-images'

const assets: MessageImageAsset[] = [
    {
        assetId: '11111111-1111-4111-8111-111111111111',
        type: 'x-risu-asset',
        name: 'pouting.1.webp',
        extension: 'webp',
        sourceUri: 'embeded://assets/other/image/pouting.1.webp.webp',
        mimeType: 'image/webp',
    },
    {
        assetId: '22222222-2222-4222-8222-222222222222',
        type: 'x-risu-asset',
        name: 'happy smile.1.webp',
        extension: 'webp',
        sourceUri: 'embeded://assets/other/image/happy smile.1.webp.webp',
        mimeType: 'image/webp',
    },
]

describe('message image expansion', () => {
    test('resolves Risu Emotion tags to a stable local character asset', () => {
        expect(expandMessageImages('<Emotion="pouting">', assets, 'message-1')).toContain(
            '/api/v1/assets/11111111-1111-4111-8111-111111111111',
        )
    })

    test('matches emotion names with spaces and keeps unknown tags as text', () => {
        const rendered = expandMessageImages(
            '<Emotion="happy smile"><Emotion="missing">',
            assets,
            'message-2',
        )
        expect(rendered).toContain('/api/v1/assets/22222222-2222-4222-8222-222222222222')
        expect(rendered).toContain('<Emotion="missing">')
    })

    test('supports Risu image shorthand only for local assets or known names', () => {
        expect(expandMessageImages('<img="pouting">', assets, 'message-3')).toContain(
            'class="malang-message-image"',
        )
        expect(expandMessageImages('<img="https://example.com/tracker.png">', assets, 'x')).toBe(
            '<img="https://example.com/tracker.png">',
        )
    })

    test('supports PocketRisu asset CBS and centered image commands', () => {
        const rendered = expandMessageImages(
            '{{img::pouting.1.webp}}{{image::happy smile.1.webp}}',
            assets,
            'message-4',
        )
        expect(rendered).toContain('/api/v1/assets/11111111-1111-4111-8111-111111111111')
        expect(rendered).toContain('class="risu-inlay-image"')
        expect(rendered).toContain('/api/v1/assets/22222222-2222-4222-8222-222222222222')
    })

    test('resolves relative HTML and Markdown image names to imported assets', () => {
        const rendered = expandMessageImages(
            '<img src="pouting.1.webp">\n![happy](<happy%20smile.1.webp>)',
            assets,
            'message-5',
        )
        expect(rendered).toContain('src="/api/v1/assets/11111111-1111-4111-8111-111111111111"')
        expect(rendered).toContain('](</api/v1/assets/22222222-2222-4222-8222-222222222222>)')
    })
})

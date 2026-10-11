import { describe, expect, test } from 'bun:test'

import { installDom } from '@test/helpers/dom'
import { makeAsset, testId } from '@test/helpers/fixtures'

import { renderMessageContentHtml } from '@/lib/render-message-content'

installDom()

const moon = makeAsset({ assetId: testId(400), name: 'moon' })

describe('message content HTML', () => {
    test('is empty when nothing is left to render', () => {
        expect(renderMessageContentHtml('', [moon], 'seed')).toBe('')
        expect(renderMessageContentHtml('{{asset::missing}}', [moon], 'seed')).toBe('')
    })

    test('expands image commands before rendering markdown', () => {
        const html = renderMessageContentHtml('**Night** {{img::moon}}', [moon], 'seed')
        expect(html).toContain('<strong>Night</strong>')
        expect(html).toContain(`src="/api/v1/assets/${moon.assetId}"`)
    })

    test('shows a finished illustration as its image', () => {
        const id = testId(700)
        const html = renderMessageContentHtml(
            `{{illustration::${id}}}`,
            [],
            'seed',
            new Map([[id, { status: 'complete', assetId: testId(401) }]]),
        )
        expect(html).toContain(`data-illustration-id="${id}"`)
        expect(html).toContain(`src="/api/v1/assets/${testId(401)}"`)
    })
})

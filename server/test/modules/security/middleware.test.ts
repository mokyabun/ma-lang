import { afterAll, describe, expect, test } from 'bun:test'

import { createTestApp } from '../../helpers/app'

const t = await createTestApp({ config: { allowedOrigins: new Set(['https://chat.example']) } })
afterAll(() => t.close())

describe('origin middleware', () => {
    test('rejects a state-changing request from an unapproved origin', async () => {
        const response = await t.send('/settings', {
            method: 'PATCH',
            headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
            body: '{}',
        })
        expect(response.status).toBe(403)
    })
})

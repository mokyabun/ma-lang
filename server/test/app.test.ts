import { afterAll, describe, expect, test } from 'bun:test'

import { createTestApp } from './helpers/app'

const t = await createTestApp()
afterAll(() => t.close())

describe('app-wide API behavior', () => {
    test('returns stable structured errors with request IDs and validation issues', async () => {
        const malformed = await t.send('/settings', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: '{',
        })
        expect(malformed.status).toBe(400)
        expect(await malformed.json()).toMatchObject({
            code: 'bad_request',
            message: 'Malformed JSON body',
            requestId: expect.any(String),
        })

        const invalid = await t.send('/settings', {
            method: 'PATCH',
            headers: { 'x-request-id': 'validation-request' },
            body: { userName: 42 },
        })
        expect(invalid.status).toBe(422)
        expect(invalid.headers.get('x-request-id')).toBe('validation-request')
        expect(await invalid.json()).toEqual({
            code: 'validation_failed',
            message: 'Request validation failed',
            details: {
                issues: [
                    expect.objectContaining({
                        path: ['userName'],
                        code: 'invalid_type',
                    }),
                ],
            },
            requestId: 'validation-request',
        })
    })
})

import { describe, expect, test } from 'bun:test'

import { mockFetch } from '@test/helpers/fetch'

import { api, ApiClientError, getClientInstanceId, promptModuleExportUrl } from '@/lib/api'

async function rejection(promise: Promise<unknown>) {
    return promise.then(
        () => {
            throw new Error('expected the request to fail')
        },
        (error: unknown) => error,
    )
}

describe('API requests', () => {
    test('sends JSON bodies with credentials under the API base', async () => {
        const { calls } = mockFetch(() => Response.json({ authenticated: true, expiresAt: '' }))
        await api.login('secret')
        expect(calls).toHaveLength(1)
        expect(calls[0]).toMatchObject({
            method: 'POST',
            path: '/api/v1/auth/login',
            credentials: 'include',
            body: JSON.stringify({ password: 'secret' }),
        })
        expect(calls[0]!.headers.get('content-type')).toBe('application/json')
    })

    test('lets the browser set the multipart content type for uploads', async () => {
        const { calls } = mockFetch(() => Response.json({}))
        await api.uploadAvatar('c1', new File(['png'], 'avatar.png', { type: 'image/png' }))
        expect(calls[0]!.body).toBeInstanceOf(FormData)
        expect(calls[0]!.headers.has('content-type')).toBe(false)
    })

    test('resolves an empty response as undefined', async () => {
        mockFetch(() => new Response(null, { status: 204 }))
        expect(await api.logout()).toBeUndefined()
    })

    test('builds the message page query only from the given options', async () => {
        const { calls } = mockFetch(() =>
            Response.json({ messages: [], hasMore: false, nextCursor: null }),
        )
        await api.messages('conv', { before: 40, limit: 50 })
        await api.messages('conv')
        expect(calls.map((call) => `${call.path}?${call.query}`)).toEqual([
            '/api/v1/conversations/conv/messages?before=40&limit=50',
            '/api/v1/conversations/conv/messages?',
        ])
    })

    test('turns a structured error body into an ApiClientError', async () => {
        mockFetch(() =>
            Response.json(
                {
                    code: 'validation_failed',
                    message: 'Name is required',
                    details: { field: 'name' },
                },
                { status: 422 },
            ),
        )
        const error = await rejection(api.createPersona({ name: '', description: '', note: '' }))
        expect(error).toBeInstanceOf(ApiClientError)
        expect(error).toMatchObject({
            message: 'Name is required',
            status: 422,
            code: 'validation_failed',
            details: { field: 'name' },
        })
    })

    test('falls back to the status text when the error body is not JSON', async () => {
        mockFetch(
            () =>
                new Response('<html>bad gateway</html>', {
                    status: 502,
                    statusText: 'Bad Gateway',
                }),
        )
        expect(await rejection(api.session())).toMatchObject({
            message: 'Bad Gateway',
            status: 502,
        })

        mockFetch(() => new Response('', { status: 500 }))
        expect(await rejection(api.session())).toMatchObject({
            message: 'Request failed',
            status: 500,
        })
    })

    test('downloads binary responses and reports their errors the same way', async () => {
        const { calls } = mockFetch(() => new Response(new Blob(['db'])))
        const blob = await api.downloadBackupSnapshot('backup 1.db')
        expect(await blob.text()).toBe('db')
        expect(calls[0]!.path).toBe('/api/v1/settings/backups/backup%201.db/download')

        mockFetch(() => Response.json({ code: 'not_found', message: 'No backup' }, { status: 404 }))
        expect(await rejection(api.downloadBackupSnapshot('gone'))).toMatchObject({
            message: 'No backup',
            status: 404,
        })
    })

    test('builds export URLs under the API base', () => {
        expect(promptModuleExportUrl('m1', 'risum')).toBe(
            '/api/v1/prompt-modules/m1/export?format=risum',
        )
    })

    test('keeps one client instance id per page without session storage', () => {
        expect(getClientInstanceId()).toBe(getClientInstanceId())
    })
})

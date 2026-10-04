import { afterEach, describe, expect, test } from 'bun:test'

import { api, type ImportProgress } from './index'

const originalFetch = globalThis.fetch
afterEach(() => {
    globalThis.fetch = originalFetch
})

const sse = (...events: unknown[]) =>
    new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'content-type': 'text/event-stream' },
    })

// Routes the client's upload protocol: create session, PUT chunks, then the import stream.
function mockServer(options: {
    create?: () => Response
    chunk?: (index: number, attempt: number) => Response
    importResponse?: () => Response
}) {
    const chunkBytes = 4
    const chunks = new Map<number, number>()
    const attempts = new Map<number, number>()
    const requests: string[] = []
    globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
        const url = new URL(input, 'http://localhost')
        requests.push(`${init.method} ${url.pathname}`)
        if (url.pathname.endsWith('/uploads') && init.method === 'POST') {
            const { size } = JSON.parse(init.body as string) as { size: number }
            return (
                options.create?.() ??
                Response.json(
                    { id: 'u1', chunkBytes, chunkCount: Math.ceil(size / chunkBytes) },
                    { status: 201 },
                )
            )
        }
        const chunkMatch = url.pathname.match(/\/uploads\/u1\/chunks\/(\d+)$/)
        if (chunkMatch) {
            const index = Number(chunkMatch[1])
            const attempt = (attempts.get(index) ?? 0) + 1
            attempts.set(index, attempt)
            const response = options.chunk?.(index, attempt) ?? Response.json({})
            if (response.ok) chunks.set(index, (init.body as Blob).size)
            return response
        }
        if (url.pathname.endsWith('/uploads/u1') && init.method === 'DELETE')
            return new Response(null, { status: 204 })
        expect((init.headers as Record<string, string>)['x-upload-id']).toBe('u1')
        return (
            options.importResponse?.() ??
            sse(
                { type: 'import.progress', stage: 'reading' },
                { type: 'import.progress', stage: 'assets', done: 1, total: 1 },
                { type: 'import.completed', status: 201, result: { character: { id: 'c1' } } },
            )
        )
    }) as unknown as typeof fetch
    return { chunks, attempts, requests }
}

const file = (size = 10) => new File([new Uint8Array(size)], '캐릭터.charx')

describe('chunked import upload', () => {
    test('uploads every chunk, then reports server progress and resolves the result', async () => {
        const server = mockServer({})
        const progress: ImportProgress[] = []
        const result = await api.importCharacter(file(), (event) => progress.push(event))

        expect(result).toEqual({ character: { id: 'c1' } } as never)
        expect([...server.chunks.entries()].sort(([a], [b]) => a - b)).toEqual([
            [0, 4],
            [1, 4],
            [2, 2],
        ])
        expect(progress[0]).toEqual({ phase: 'upload', loaded: 0, total: 10 })
        expect(progress.filter((event) => event.phase === 'upload').at(-1)).toEqual({
            phase: 'upload',
            loaded: 10,
            total: 10,
        })
        expect(progress.slice(-2)).toEqual([
            { phase: 'reading' },
            { phase: 'assets', done: 1, total: 1 },
        ])
    })

    test('retries a chunk after a gateway error', async () => {
        const server = mockServer({
            chunk: (index, attempt) =>
                index === 1 && attempt === 1
                    ? new Response('bad gateway', { status: 502 })
                    : Response.json({}),
        })
        await api.importCharacter(file())
        expect(server.attempts.get(1)).toBe(2)
    })

    test('explains the import limit and the proxy chunk limit', async () => {
        mockServer({
            create: () =>
                Response.json(
                    {
                        code: 'bad_request',
                        message: 'Import file is too large',
                        details: { maxBytes: 1_048_576 },
                    },
                    { status: 413 },
                ),
        })
        const tooLarge = await api.importCharacter(file()).catch((error: Error) => error.message)
        expect(tooLarge).toContain('1.0 MiB')
        expect(tooLarge).toContain('MAX_IMPORT_BYTES')

        const server = mockServer({
            chunk: () => new Response('<html>413</html>', { status: 413 }),
        })
        expect(await api.importCharacter(file()).catch((error: Error) => error.message)).toContain(
            'UPLOAD_CHUNK_BYTES',
        )
        expect(server.requests).toContain('DELETE /api/v1/uploads/u1')
    })

    test('rejects with the error streamed by a failed import', async () => {
        mockServer({
            importResponse: () =>
                sse({
                    type: 'import.failed',
                    status: 422,
                    error: { code: 'validation_failed', message: 'Invalid CHARX archive' },
                }),
        })
        expect(await api.importCharacter(file()).catch((error: unknown) => error)).toMatchObject({
            message: 'Invalid CHARX archive',
            status: 422,
        })
    })
})

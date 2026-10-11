export interface FetchCall {
    method: string
    path: string
    query: URLSearchParams
    headers: Headers
    credentials: RequestCredentials | undefined
    body: BodyInit | null | undefined
}

/** Replaces `globalThis.fetch` for the current test; `test/setup.ts` restores it. */
export function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
    const calls: FetchCall[] = []
    globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
        const url = new URL(String(input), 'http://malang.test')
        const call: FetchCall = {
            method: init.method ?? 'GET',
            path: url.pathname,
            query: url.searchParams,
            headers: new Headers(init.headers),
            credentials: init.credentials,
            body: init.body,
        }
        calls.push(call)
        return handler(call)
    }) as typeof fetch
    return { calls }
}

/** A `text/event-stream` response with one `data:` block per event. */
export function sse(...events: unknown[]): Response {
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'content-type': 'text/event-stream' },
    })
}

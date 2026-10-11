type FetchHandler = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** Replaces `globalThis.fetch` until the returned `restore` is called. */
export function mockFetch(handler: FetchHandler) {
    const original = globalThis.fetch
    globalThis.fetch = handler as typeof fetch
    return function restore() {
        globalThis.fetch = original
    }
}

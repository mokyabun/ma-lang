/** A fake Ollama server; a last message containing `cancel` streams slowly. */
export function startFakeOllama() {
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            const url = new URL(request.url)
            if (url.pathname === '/api/version') return Response.json({ version: 'test' })
            if (url.pathname === '/api/tags')
                return Response.json({ models: [{ name: 'test-model' }] })
            if (url.pathname !== '/api/chat') return new Response(null, { status: 404 })
            const body = (await request.json()) as { messages?: Array<{ content?: string }> }
            const slow = body.messages?.at(-1)?.content?.includes('cancel')
            return new Response(
                new ReadableStream<Uint8Array>({
                    async start(controller) {
                        controller.enqueue(
                            new TextEncoder().encode('{"message":{"content":"Hello"}}\n'),
                        )
                        await Bun.sleep(slow ? 500 : 30)
                        if (request.signal.aborted) return
                        controller.enqueue(
                            new TextEncoder().encode(
                                '{"message":{"content":" from Ollama"}}\n{"done":true,"prompt_eval_count":12,"eval_count":3}\n',
                            ),
                        )
                        controller.close()
                    },
                }),
                { headers: { 'content-type': 'application/x-ndjson' } },
            )
        },
    })
    return {
        url: server.url.origin,
        stop: () => server.stop(true),
    }
}

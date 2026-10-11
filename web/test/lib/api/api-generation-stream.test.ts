import { describe, expect, test } from 'bun:test'

import type { GenerationEvent, GenerationRequest } from '@malang/shared'
import { mockFetch, sse } from '@test/helpers/fetch'
import { testId } from '@test/helpers/fixtures'

import { ApiClientError, streamGeneration } from '@/lib/api'

const generationId = testId(500)
const messageId = testId(200)
const request: GenerationRequest = {
    mode: 'reply',
    content: 'Hello',
    idempotencyKey: testId(800),
    clientInstanceId: testId(801),
}

function chunkedStream(chunks: string[]) {
    const encoder = new TextEncoder()
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
            controller.close()
        },
    })
}

async function collect(conversationId = 'conv') {
    const events: GenerationEvent[] = []
    const id = await streamGeneration(conversationId, request, (event) => events.push(event))
    return { id, events }
}

describe('generation stream', () => {
    test('posts the request and reads events split across chunks', async () => {
        const delta = JSON.stringify({
            type: 'message.delta',
            generationId,
            messageId,
            delta: '안녕',
        })
        const { calls } = mockFetch(
            () =>
                new Response(
                    chunkedStream([
                        `data: ${JSON.stringify({ type: 'generation.started', generationId, messageId })}\n\nda`,
                        `ta: ${delta.slice(0, 20)}`,
                        `${delta.slice(20)}\n\n`,
                    ]),
                    { headers: { 'x-generation-id': generationId } },
                ),
        )
        const { id, events } = await collect()

        expect(id).toBe(generationId)
        expect(events.map((event) => event.type)).toEqual(['generation.started', 'message.delta'])
        expect(events[1]).toMatchObject({ delta: '안녕' })
        expect(calls[0]).toMatchObject({
            method: 'POST',
            path: '/api/v1/conversations/conv/generations',
            body: JSON.stringify(request),
        })
    })

    test('joins a multi-line data field and ignores comments', async () => {
        mockFetch(
            () =>
                new Response(
                    chunkedStream([
                        ': keep-alive\n\n',
                        `data: {"type":"message.snapshot",\ndata: "generationId":"${generationId}","messageId":"${messageId}","content":"x"}\n\n`,
                    ]),
                ),
        )
        const { id, events } = await collect()
        expect(id).toBe('')
        expect(events).toEqual([
            { type: 'message.snapshot', generationId, messageId, content: 'x' },
        ])
    })

    test('retries after a network error', async () => {
        let attempts = 0
        mockFetch(() => {
            attempts += 1
            if (attempts === 1) throw new TypeError('network down')
            return sse({ type: 'generation.started', generationId, messageId })
        })
        const { events } = await collect()
        expect(attempts).toBe(2)
        expect(events).toHaveLength(1)
    })

    test('does not retry an API error', async () => {
        let attempts = 0
        mockFetch(() => {
            attempts += 1
            return Response.json(
                { code: 'conflict', message: 'A generation is already running' },
                { status: 409 },
            )
        })
        const error = await collect().catch((cause: unknown) => cause)
        expect(error).toBeInstanceOf(ApiClientError)
        expect(error).toMatchObject({ status: 409, message: 'A generation is already running' })
        expect(attempts).toBe(1)
    })
})

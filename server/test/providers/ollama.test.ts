import { describe, expect, test } from 'bun:test'

import { parseNdjson } from '@/services/providers/ollama'

function streamOf(...parts: string[]) {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const part of parts) controller.enqueue(new TextEncoder().encode(part))
            controller.close()
        },
    })
}

describe('Ollama NDJSON parser', () => {
    test('handles arbitrary network chunk boundaries and a final unterminated line', async () => {
        const stream = streamOf(
            '{"message":{"content":"Hel',
            'lo"}}\n\n{"done":true,"eval_count":2}',
        )
        expect(await Array.fromAsync(parseNdjson(stream))).toEqual([
            { message: { content: 'Hello' } },
            { done: true, eval_count: 2 },
        ])
    })

    test('rejects malformed provider output', async () => {
        const stream = streamOf('not-json\n')
        expect(Array.fromAsync(parseNdjson(stream))).rejects.toThrow('malformed NDJSON')
    })
})

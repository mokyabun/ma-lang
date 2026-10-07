import { describe, expect, test } from 'bun:test'

import { DEFAULT_NOVELAI_IMAGE_PARAMS } from '@malang/shared'
import { zipSync } from 'fflate'

import {
    buildNovelAIRequest,
    extractImage,
    NovelAIImageClient,
    NovelAIImageError,
    type NovelAIImageInput,
} from '@/services/illustration'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

const input: NovelAIImageInput = {
    positive: 'artist:foo, 2girls, bedroom',
    negative: 'lowres',
    characters: [
        { prompt: '1girl, aria, smile', negative: 'hat' },
        { prompt: '1girl, bell, sitting', negative: '' },
    ],
    params: { ...DEFAULT_NOVELAI_IMAGE_PARAMS, seed: 42 },
}

interface SentRequest {
    url: string
    headers: Headers
    body: string
    signal?: AbortSignal | null
}

function fakeFetch(respond: (request: SentRequest) => Response | Promise<Response>) {
    const requests: SentRequest[] = []
    const impl = (async (url: string, init: RequestInit & { body: string }) => {
        const request = {
            url,
            headers: new Headers(init.headers),
            body: init.body,
            signal: init.signal,
        }
        requests.push(request)
        return respond(request)
    }) as unknown as typeof fetch
    return { impl, requests }
}

function client(fetchImpl: typeof fetch) {
    return new NovelAIImageClient({
        endpoint: 'https://image.example/',
        apiKey: 'pst-secret',
        fetch: fetchImpl,
    })
}

async function generateError(response: Response | Error): Promise<NovelAIImageError> {
    const { impl } = fakeFetch(() => {
        if (response instanceof Error) throw response
        return response
    })
    try {
        await client(impl).generate(input)
    } catch (error) {
        if (error instanceof NovelAIImageError) return error
        throw error
    }
    throw new Error('generate() did not fail')
}

describe('NovelAI image request', () => {
    test('puts the scene in base_caption and each character in its own caption', () => {
        const request = buildNovelAIRequest(input, 7)
        const parameters = request.parameters

        expect(request).toMatchObject({ input: input.positive, model: input.params.model })
        expect(parameters.seed).toBe(7)
        expect(parameters.v4_prompt).toEqual({
            caption: {
                base_caption: 'artist:foo, 2girls, bedroom',
                char_captions: [
                    { char_caption: '1girl, aria, smile', centers: [{ x: 0.5, y: 0.5 }] },
                    { char_caption: '1girl, bell, sitting', centers: [{ x: 0.5, y: 0.5 }] },
                ],
            },
            use_coords: false,
            use_order: true,
        })
        expect(parameters.v4_negative_prompt.caption).toEqual({
            base_caption: 'lowres',
            char_captions: [
                { char_caption: 'hat', centers: [{ x: 0.5, y: 0.5 }] },
                { char_caption: '', centers: [{ x: 0.5, y: 0.5 }] },
            ],
        })
        expect(parameters).toMatchObject({
            width: 832,
            height: 1216,
            sampler: 'k_euler_ancestral',
            noise_schedule: 'karras',
            cfg_rescale: 0,
            use_coords: false,
        })
    })
})

describe('NovelAI image client', () => {
    test('sends the key only as a bearer header and returns the PNG from the ZIP', async () => {
        const { impl, requests } = fakeFetch(
            () => new Response(zipSync({ 'image_0.png': png }), { status: 200 }),
        )
        const result = await client(impl).generate(input)

        expect(result.image).toEqual(png)
        expect(result.seed).toBe(42)
        expect(requests[0]!.url).toBe('https://image.example/ai/generate-image')
        expect(requests[0]!.headers.get('authorization')).toBe('Bearer pst-secret')
        const body = requests[0]!.body
        expect(body).not.toContain('pst-secret')
        expect(JSON.parse(body)).toEqual(result.request)
    })

    test('draws a seed when none is set', async () => {
        const { impl } = fakeFetch(() => new Response(png))
        const result = await client(impl).generate({
            ...input,
            params: { ...input.params, seed: null },
        })
        expect(result.request.parameters.seed).toBe(result.seed)
        expect(Number.isInteger(result.seed)).toBe(true)
    })

    test('classifies failures', async () => {
        const unauthorized = await generateError(
            Response.json({ statusCode: 401, message: 'Invalid token' }, { status: 401 }),
        )
        expect(unauthorized).toMatchObject({ reason: 'unauthorized', retryable: false })
        expect(unauthorized.message).toContain('Invalid token')

        expect(await generateError(new Response('', { status: 402 }))).toMatchObject({
            reason: 'payment_required',
            retryable: false,
        })
        expect(
            await generateError(
                new Response('Concurrent generation is locked', {
                    status: 429,
                    headers: { 'retry-after': '3' },
                }),
            ),
        ).toMatchObject({ reason: 'rate_limited', retryable: true, retryAfterMs: 3000 })
        expect(await generateError(new Response('', { status: 503 }))).toMatchObject({
            reason: 'server',
            retryable: true,
        })
        expect(await generateError(new TypeError('fetch failed'))).toMatchObject({
            reason: 'network',
            retryable: true,
        })
        expect(await generateError(new Response('bad size', { status: 400 }))).toMatchObject({
            reason: 'invalid_request',
            retryable: false,
        })
    })

    test('passes an abort through instead of reporting a network error', async () => {
        const controller = new AbortController()
        const { impl } = fakeFetch((request) => {
            controller.abort()
            throw request.signal?.reason ?? new DOMException('Aborted', 'AbortError')
        })
        const failure = await client(impl)
            .generate(input, controller.signal)
            .catch((error: unknown) => error)
        expect(failure).not.toBeInstanceOf(NovelAIImageError)
    })
})

describe('NovelAI response archive', () => {
    test('rejects archives without a PNG', () => {
        expect(() => extractImage(zipSync({ 'notes.txt': new Uint8Array([1]) }))).toThrow(
            NovelAIImageError,
        )
        expect(() => extractImage(new Uint8Array([1, 2, 3]))).toThrow(NovelAIImageError)
    })
})

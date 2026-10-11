import type { NovelAIImageParams } from '@malang/shared'
import { unzipSync } from 'fflate'

import { AppError, type AppErrorKind } from '@/lib/errors/app-error'

export interface NovelAICharacterCaption {
    prompt: string
    negative: string
}

export interface NovelAIImageInput {
    positive: string
    negative: string
    characters: NovelAICharacterCaption[]
    params: NovelAIImageParams
}

export interface NovelAIImageResult {
    image: Uint8Array
    mimeType: 'image/png'
    seed: number
    /** The exact request body; it never contains the API key. */
    request: NovelAIRequestBody
}

export type NovelAIRequestBody = ReturnType<typeof buildNovelAIRequest>

export type NovelAIErrorReason =
    | 'unauthorized'
    | 'payment_required'
    | 'rate_limited'
    | 'server'
    | 'network'
    | 'invalid_request'
    | 'invalid_response'

const REASON_KINDS: Record<NovelAIErrorReason, AppErrorKind> = {
    unauthorized: 'provider_auth',
    payment_required: 'provider_auth',
    rate_limited: 'rate_limited',
    server: 'provider_unreachable',
    network: 'provider_unreachable',
    invalid_request: 'bad_request',
    invalid_response: 'invalid_provider_response',
}

export class NovelAIImageError extends AppError {
    constructor(
        readonly reason: NovelAIErrorReason,
        message: string,
        readonly status?: number,
        readonly retryAfterMs?: number,
        options?: ErrorOptions,
    ) {
        super(REASON_KINDS[reason], message, { reason, status }, options)
    }

    get retryable(): boolean {
        return (
            this.reason === 'rate_limited' || this.reason === 'server' || this.reason === 'network'
        )
    }
}

// Positions are left to NovelAI (`use_coords: false`), but V4 still requires a center per caption.
const DEFAULT_CENTER = { x: 0.5, y: 0.5 }
const MAX_SEED = 4_294_967_295
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

export function buildNovelAIRequest(input: NovelAIImageInput, seed: number) {
    const { params } = input
    return {
        input: input.positive,
        model: params.model,
        action: 'generate' as const,
        parameters: {
            params_version: 3,
            width: params.width,
            height: params.height,
            scale: params.scale,
            sampler: params.sampler,
            steps: params.steps,
            n_samples: 1,
            seed,
            cfg_rescale: params.cfgRescale,
            noise_schedule: params.noiseSchedule,
            // Quality tags and UC presets are left out: Malang's own fixed prompts replace them.
            qualityToggle: false,
            ucPreset: 3,
            dynamic_thresholding: false,
            legacy: false,
            legacy_v3_extend: false,
            add_original_image: true,
            prefer_brownian: true,
            deliberate_euler_ancestral_bug: false,
            use_coords: false,
            legacy_uc: false,
            normalize_reference_strength_multiple: true,
            negative_prompt: input.negative,
            characterPrompts: input.characters.map((character) => ({
                prompt: character.prompt,
                uc: character.negative,
                center: DEFAULT_CENTER,
                enabled: true,
            })),
            v4_prompt: {
                caption: {
                    base_caption: input.positive,
                    char_captions: input.characters.map((character) => ({
                        char_caption: character.prompt,
                        centers: [DEFAULT_CENTER],
                    })),
                },
                use_coords: false,
                use_order: true,
            },
            v4_negative_prompt: {
                caption: {
                    base_caption: input.negative,
                    char_captions: input.characters.map((character) => ({
                        char_caption: character.negative,
                        centers: [DEFAULT_CENTER],
                    })),
                },
                legacy_uc: false,
            },
        },
    }
}

export function randomSeed(): number {
    return crypto.getRandomValues(new Uint32Array(1))[0]! % MAX_SEED
}

export interface NovelAIClientOptions {
    endpoint: string
    apiKey: string
    fetch?: typeof fetch
}

export class NovelAIImageClient {
    private readonly fetch: typeof fetch

    constructor(private readonly options: NovelAIClientOptions) {
        this.fetch = options.fetch ?? fetch
    }

    async generate(input: NovelAIImageInput, signal?: AbortSignal): Promise<NovelAIImageResult> {
        const seed = input.params.seed ?? randomSeed()
        const request = buildNovelAIRequest(input, seed)
        let response: Response
        try {
            response = await this.fetch(
                `${this.options.endpoint.replace(/\/+$/, '')}/ai/generate-image`,
                {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${this.options.apiKey}`,
                        'content-type': 'application/json',
                        accept: 'application/zip, image/png',
                    },
                    body: JSON.stringify(request),
                    signal,
                },
            )
        } catch (error) {
            if (signal?.aborted) throw error
            throw new NovelAIImageError(
                'network',
                'NovelAI could not be reached',
                undefined,
                undefined,
                {
                    cause: error,
                },
            )
        }
        if (!response.ok) throw await responseError(response)
        const body = new Uint8Array(await response.arrayBuffer())
        return { image: extractImage(body), mimeType: 'image/png', seed, request }
    }
}

/** NovelAI answers with a ZIP holding `image_0.png`; some proxies return the PNG itself. */
export function extractImage(body: Uint8Array): Uint8Array {
    if (isPng(body)) return body
    let entries: Record<string, Uint8Array>
    try {
        entries = unzipSync(body, { filter: (file) => file.name.toLowerCase().endsWith('.png') })
    } catch (error) {
        throw new NovelAIImageError(
            'invalid_response',
            'NovelAI returned an unreadable image archive',
            undefined,
            undefined,
            { cause: error },
        )
    }
    const name = Object.keys(entries).sort()[0]
    const image = name ? entries[name] : undefined
    if (!image || !isPng(image)) {
        throw new NovelAIImageError('invalid_response', 'NovelAI returned no image')
    }
    return image
}

async function responseError(response: Response): Promise<NovelAIImageError> {
    const detail = await responseMessage(response)
    const status = response.status
    const suffix = detail ? `: ${detail}` : ''
    if (status === 401 || status === 403) {
        return new NovelAIImageError(
            'unauthorized',
            `NovelAI rejected the API key${suffix}`,
            status,
        )
    }
    if (status === 402) {
        return new NovelAIImageError(
            'payment_required',
            `NovelAI needs an active subscription or more Anlas${suffix}`,
            status,
        )
    }
    if (status === 429) {
        return new NovelAIImageError(
            'rate_limited',
            `NovelAI is busy with another generation${suffix}`,
            status,
            retryAfterMs(response.headers.get('retry-after')),
        )
    }
    if (status >= 500) {
        return new NovelAIImageError('server', `NovelAI failed (${status})${suffix}`, status)
    }
    return new NovelAIImageError('invalid_request', `NovelAI rejected the request${suffix}`, status)
}

async function responseMessage(response: Response): Promise<string> {
    const text = (await response.text().catch(() => '')).trim()
    try {
        const body = JSON.parse(text) as { message?: unknown }
        if (typeof body.message === 'string') return body.message
    } catch {
        // Not JSON; fall back to the raw text.
    }
    return text.slice(0, 500)
}

function retryAfterMs(header: string | null): number | undefined {
    if (!header) return undefined
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const date = Date.parse(header)
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

function isPng(bytes: Uint8Array): boolean {
    return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

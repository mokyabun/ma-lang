import { setTimeout as delay } from 'node:timers/promises'

import { novelAILogitBiasExp, novelListLogitBias } from './bias'
import { promptFromMessages } from './openai-compatible'
import {
    checkedFetch,
    type ProviderAdapter,
    type ProviderChunk,
    ProviderError,
    type ProviderModel,
    type RuntimeProviderConfig,
} from './types'

export class LegacyPocketAdapter implements ProviderAdapter {
    readonly kind = 'kobold' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (['webllm', 'plugin'].includes(config.provider)) {
            throw new ProviderError(
                'provider_unreachable',
                config.provider === 'webllm'
                    ? 'WebLLM is a browser GPU runtime and cannot run in Malang’s server-only provider pipeline. Use an Ooba, Ollama, or OpenAI-compatible endpoint for the same local model.'
                    : 'Browser plugins cannot execute on the Malang server. Configure the plugin backend as an OpenAI-compatible endpoint instead.',
            )
        }
        if (!config.modelId) throw new ProviderError('model_not_found', 'A model ID is required')
        if (!['echo', 'horde', 'kobold'].includes(config.provider) && !config.apiKey) {
            throw new ProviderError('provider_auth', `${config.provider} requires an API key`)
        }
        if (['kobold', 'mancer'].includes(config.provider) && !config.baseUrl) {
            throw new ProviderError(
                'provider_unreachable',
                `${config.provider === 'mancer' ? 'Mancer' : 'Kobold'} requires a server URL`,
            )
        }
    }

    async healthCheck(config: RuntimeProviderConfig) {
        this.validateConfig(config)
        if (config.provider === 'echo') return { ok: true, message: 'Echo provider is ready' }
        if (config.provider === 'horde') {
            await checkedFetch('https://stablehorde.net/api/v2/status/heartbeat', {
                signal: AbortSignal.timeout(15_000),
            })
            return { ok: true, message: 'AI Horde is reachable' }
        }
        return { ok: true, message: `${config.provider} configuration is valid` }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        if (config.provider === 'horde') {
            const response = await checkedFetch(
                'https://stablehorde.net/api/v2/status/models?type=text',
                {
                    signal: AbortSignal.timeout(20_000),
                },
            )
            const body = (await response.json()) as Array<Record<string, unknown>>
            return body
                .map((model) => ({
                    id: typeof model.name === 'string' ? model.name : '',
                    name: typeof model.name === 'string' ? model.name : '',
                    details: model,
                }))
                .filter((model) => model.id)
        }
        return [{ id: config.modelId, name: config.modelId }]
    }

    async *streamChat(
        config: RuntimeProviderConfig,
        request: Parameters<ProviderAdapter['streamChat']>[1],
    ): AsyncGenerator<ProviderChunk> {
        this.validateConfig(config)
        switch (config.provider) {
            case 'echo': {
                const delayMs = numberOption(config, 'delayMs') ?? 0
                if (delayMs > 0) await delay(delayMs, undefined, { signal: request.signal })
                request.onRequest?.({
                    endpoint: 'echo://local/generate',
                    method: 'POST',
                    headers: {},
                    body: {
                        model: config.modelId,
                        messages: request.messages,
                        parameters: request.parameters,
                    },
                })
                yield { delta: stringOption(config, 'message') || 'Echo Message' }
                return
            }
            case 'kobold':
                yield* kobold(config, request)
                return
            case 'mancer':
                yield* mancer(config, request)
                return
            case 'novelai':
                yield* novelAI(config, request)
                return
            case 'novellist':
                yield* novelList(config, request)
                return
            case 'horde':
                yield* horde(config, request)
                return
            default:
                throw new ProviderError(
                    'provider_unreachable',
                    'This provider cannot run on the server',
                )
        }
    }
}

async function* mancer(
    config: RuntimeProviderConfig,
    request: Parameters<ProviderAdapter['streamChat']>[1],
): AsyncGenerator<ProviderChunk> {
    const urlObject = new URL(config.baseUrl || '')
    urlObject.pathname = '/api/v1/generate'
    const body = {
        prompt: promptFromMessages(request.messages),
        max_new_tokens: request.parameters.maxOutputTokens,
        truncation_length: request.parameters.maxContextTokens,
        temperature: request.parameters.temperature,
        top_p: request.parameters.topP,
        top_k: request.parameters.topK,
        repetition_penalty: request.parameters.repetitionPenalty,
        stopping_strings: request.parameters.stopSequences,
        do_sample: true,
        seed: -1,
        ...objectOption(config, 'parameters'),
    }
    request.onRequest?.({
        endpoint: urlObject.toString(),
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-API-KEY': '[redacted]' },
        body,
    })
    const response = await checkedFetch(urlObject.toString(), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'X-API-KEY': config.apiKey || '',
        },
        body: JSON.stringify(body),
        signal: request.signal,
    })
    const result = (await response.json()) as {
        results?: Array<{ text?: string }>
    }
    const text = result.results?.[0]?.text
    if (typeof text !== 'string') {
        throw new ProviderError('invalid_provider_response', 'Mancer returned no text')
    }
    yield { delta: text }
}

async function* kobold(
    config: RuntimeProviderConfig,
    request: Parameters<ProviderAdapter['streamChat']>[1],
): AsyncGenerator<ProviderChunk> {
    const urlObject = new URL(config.baseUrl || '')
    if (urlObject.pathname.length < 3) urlObject.pathname = '/api/v1/generate'
    const body = {
        prompt: promptFromMessages(request.messages),
        max_length: request.parameters.maxOutputTokens,
        max_context_length: request.parameters.maxContextTokens,
        temperature: request.parameters.temperature,
        top_p: request.parameters.topP,
        top_k: request.parameters.topK,
        top_a: request.parameters.topA,
        rep_pen: request.parameters.repetitionPenalty,
        stop_sequence: request.parameters.stopSequences,
        n: 1,
    }
    request.onRequest?.({
        endpoint: urlObject.toString(),
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
    })
    const response = await checkedFetch(urlObject.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: request.signal,
    })
    const result = (await response.json()) as {
        results?: Array<{ text?: string }>
    }
    const text = result.results?.[0]?.text
    if (typeof text !== 'string')
        throw new ProviderError('invalid_provider_response', 'Kobold returned no text')
    yield { delta: text }
}

async function* novelAI(
    config: RuntimeProviderConfig,
    request: Parameters<ProviderAdapter['streamChat']>[1],
): AsyncGenerator<ProviderChunk> {
    const url = config.baseUrl || 'https://text.novelai.net/ai/generate'
    const body = {
        input: promptFromMessages(request.messages),
        model: config.modelId,
        parameters: {
            temperature: request.parameters.temperature,
            max_length: request.parameters.maxOutputTokens,
            min_length: 1,
            top_k: request.parameters.topK,
            top_p: request.parameters.topP,
            top_a: request.parameters.topA,
            repetition_penalty: request.parameters.repetitionPenalty,
            stop_sequences: request.parameters.stopSequences,
            use_string: true,
            return_full_text: false,
            logit_bias_exp: request.bias ? novelAILogitBiasExp(request.bias) : [],
            ...objectOption(config, 'parameters'),
        },
    }
    request.onRequest?.({
        endpoint: url,
        method: 'POST',
        headers: {
            authorization: 'Bearer [redacted]',
            'content-type': 'application/json',
        },
        body,
    })
    const response = await checkedFetch(url, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: request.signal,
    })
    const result = (await response.json()) as { output?: string }
    if (typeof result.output !== 'string')
        throw new ProviderError('invalid_provider_response', 'NovelAI returned no output')
    yield { delta: result.output }
}

async function* novelList(
    config: RuntimeProviderConfig,
    request: Parameters<ProviderAdapter['streamChat']>[1],
): AsyncGenerator<ProviderChunk> {
    const url = config.baseUrl || 'https://api.tringpt.com/api'
    const body = {
        text: promptFromMessages(request.messages),
        length: request.parameters.maxOutputTokens,
        temperature: request.parameters.temperature,
        top_p: request.parameters.topP,
        top_k: request.parameters.topK,
        rep_pen: request.parameters.repetitionPenalty,
        top_a: request.parameters.topA,
        model: config.modelId,
        ...novelListLogitBias(request.bias?.entries ?? []),
        ...objectOption(config, 'parameters'),
    }
    request.onRequest?.({
        endpoint: url,
        method: 'POST',
        headers: {
            authorization: 'Bearer [redacted]',
            'content-type': 'application/json',
        },
        body,
    })
    const response = await checkedFetch(url, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: request.signal,
    })
    const result = (await response.json()) as {
        data?: unknown[]
        error?: string
    }
    if (result.error) throw new ProviderError('invalid_provider_response', result.error)
    const text = result.data?.[0]
    if (typeof text !== 'string')
        throw new ProviderError('invalid_provider_response', 'NovelList returned no output')
    yield { delta: text }
}

async function* horde(
    config: RuntimeProviderConfig,
    request: Parameters<ProviderAdapter['streamChat']>[1],
): AsyncGenerator<ProviderChunk> {
    const base = (config.baseUrl || 'https://stablehorde.net/api/v2').replace(/\/+$/, '')
    const body: Record<string, unknown> = {
        prompt: promptFromMessages(request.messages),
        params: {
            n: 1,
            max_context_length: request.parameters.maxContextTokens,
            max_length: request.parameters.maxOutputTokens,
            singleline: false,
            temperature: request.parameters.temperature,
            top_k: request.parameters.topK,
            top_p: request.parameters.topP,
        },
        trusted_workers: false,
        slow_workers: true,
        models: config.modelId === 'auto' ? undefined : [config.modelId],
    }
    const response = await checkedFetch(`${base}/generate/text/async`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            apikey: config.apiKey || '0000000000',
        },
        body: JSON.stringify(body),
        signal: request.signal,
    })
    const queued = (await response.json()) as { id?: string }
    if (!queued.id)
        throw new ProviderError('invalid_provider_response', 'AI Horde returned no request ID')
    try {
        while (true) {
            await delay(2_000, undefined, { signal: request.signal })
            const status = await checkedFetch(`${base}/generate/text/status/${queued.id}`, {
                signal: request.signal,
            })
            const value = (await status.json()) as {
                done?: boolean
                is_possible?: boolean
                generations?: Array<{ text?: string }>
            }
            if (value.is_possible === false)
                throw new ProviderError(
                    'provider_unreachable',
                    'AI Horde cannot fulfill this request',
                )
            if (!value.done) continue
            const text = value.generations?.[0]?.text
            if (typeof text !== 'string')
                throw new ProviderError('invalid_provider_response', 'AI Horde returned no output')
            yield { delta: text }
            return
        }
    } finally {
        if (request.signal.aborted) {
            void fetch(`${base}/generate/text/status/${queued.id}`, {
                method: 'DELETE',
            })
        }
    }
}

function stringOption(config: RuntimeProviderConfig, key: string): string | undefined {
    const value = config.providerOptions?.[key]
    return typeof value === 'string' ? value : undefined
}

function numberOption(config: RuntimeProviderConfig, key: string): number | undefined {
    const value = config.providerOptions?.[key]
    return typeof value === 'number' ? value : undefined
}

function objectOption(config: RuntimeProviderConfig, key: string): Record<string, unknown> {
    const value = config.providerOptions?.[key]
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
}

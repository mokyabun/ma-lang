import type { CompiledMessage, GenerationParameters } from '@malang/shared'

import { type GenerationBias, openAILogitBias, sendsOpenAILogitBias } from './bias'
import { endpoint, jsonObject, parseSse } from './http-stream'
import {
    checkedFetch,
    type ProviderAdapter,
    type ProviderChunk,
    ProviderError,
    type ProviderModel,
    type RuntimeProviderConfig,
} from './types'

const defaultBases: Partial<Record<RuntimeProviderConfig['provider'], string>> = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    mistral: 'https://api.mistral.ai/v1',
    deepseek: 'https://api.deepseek.com',
    deepinfra: 'https://api.deepinfra.com/v1/openai',
    nanogpt: 'https://nano-gpt.com/api/v1',
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
    readonly kind = 'openai-compatible' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (!config.modelId) throw new ProviderError('model_not_found', 'A model ID is required')
        baseUrl(config)
        if (!config.apiKey && !['ooba', 'openai-compatible'].includes(config.provider)) {
            throw new ProviderError('provider_auth', `${config.provider} requires an API key`)
        }
    }

    async healthCheck(config: RuntimeProviderConfig) {
        const models = await this.listModels(config)
        return {
            ok: true,
            message: models.length
                ? `${config.provider}: ${models.length} models available`
                : `${config.provider} is reachable`,
        }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        const response = await checkedFetch(endpoint(baseUrl(config), '/models'), {
            headers: authHeaders(config),
            signal: AbortSignal.timeout(15_000),
        })
        const body = (await response.json()) as {
            data?: Array<Record<string, unknown>>
        }
        return (body.data || [])
            .map((model) => ({
                id: typeof model.id === 'string' ? model.id : '',
                name:
                    typeof model.name === 'string'
                        ? model.name
                        : typeof model.id === 'string'
                          ? model.id
                          : '',
                details: model,
            }))
            .filter((model) => model.id)
    }

    async *streamChat(
        config: RuntimeProviderConfig,
        request: Parameters<ProviderAdapter['streamChat']>[1],
    ): AsyncGenerator<ProviderChunk> {
        this.validateConfig(config)
        if (config.apiFormat === 'openai-responses') {
            yield* streamResponses(config, request)
            return
        }
        if (config.apiFormat === 'openai-completions' || config.provider === 'ooba') {
            yield* streamCompletions(config, request)
            return
        }
        const url = endpoint(baseUrl(config), '/chat/completions')
        const body = {
            model: config.modelId,
            messages: request.messages,
            stream: true,
            ...openAIParameters(request.parameters),
            ...logitBiasBody(config, request.bias),
            ...providerBody(config),
        }
        request.onRequest?.({
            endpoint: url,
            method: 'POST',
            headers: debugHeaders(config),
            body,
        })
        const response = await checkedFetch(url, {
            method: 'POST',
            headers: authHeaders(config),
            body: JSON.stringify(body),
            signal: request.signal,
        })
        if (!response.body)
            throw new ProviderError(
                'invalid_provider_response',
                'Provider returned an empty stream',
            )
        for await (const event of parseSse(
            response.body as unknown as ReadableStream<Uint8Array>,
        )) {
            if (event.data === '[DONE]') break
            const value = jsonObject(event.data, config.provider)
            if (value.error) throw providerPayloadError(value.error)
            const choice = Array.isArray(value.choices) ? value.choices[0] : undefined
            const delta = objectValue(choice)?.delta
            const content = textContent(objectValue(delta)?.content)
            const usage = objectValue(value.usage)
            if (content || usage) {
                yield {
                    delta: content,
                    usage: usage
                        ? {
                              inputTokens: numberValue(usage.prompt_tokens),
                              outputTokens: numberValue(usage.completion_tokens),
                          }
                        : undefined,
                }
            }
        }
    }
}

async function* streamResponses(
    config: RuntimeProviderConfig,
    request: Parameters<ProviderAdapter['streamChat']>[1],
): AsyncGenerator<ProviderChunk> {
    const url = endpoint(baseUrl(config), '/responses')
    const body = {
        model: config.modelId,
        input: request.messages,
        stream: true,
        temperature: request.parameters.temperature,
        top_p: request.parameters.topP,
        max_output_tokens: request.parameters.maxOutputTokens,
        ...providerBody(config),
    }
    request.onRequest?.({
        endpoint: url,
        method: 'POST',
        headers: debugHeaders(config),
        body,
    })
    const response = await checkedFetch(url, {
        method: 'POST',
        headers: authHeaders(config),
        body: JSON.stringify(body),
        signal: request.signal,
    })
    if (!response.body)
        throw new ProviderError('invalid_provider_response', 'Provider returned an empty stream')
    for await (const event of parseSse(response.body as unknown as ReadableStream<Uint8Array>)) {
        if (event.data === '[DONE]') break
        const value = jsonObject(event.data, config.provider)
        const type = typeof value.type === 'string' ? value.type : event.event
        if (type === 'error') throw providerPayloadError(value.error || value)
        if (type === 'response.output_text.delta' && typeof value.delta === 'string') {
            yield { delta: value.delta }
        }
        if (type === 'response.completed') {
            const usage = objectValue(objectValue(value.response)?.usage)
            if (usage) {
                yield {
                    delta: '',
                    usage: {
                        inputTokens: numberValue(usage.input_tokens),
                        outputTokens: numberValue(usage.output_tokens),
                    },
                }
            }
        }
    }
}

async function* streamCompletions(
    config: RuntimeProviderConfig,
    request: Parameters<ProviderAdapter['streamChat']>[1],
): AsyncGenerator<ProviderChunk> {
    const url = endpoint(baseUrl(config), '/completions')
    const body = {
        model: config.modelId,
        prompt: promptFromMessages(request.messages),
        stream: true,
        ...openAIParameters(request.parameters),
        ...providerBody(config),
    }
    request.onRequest?.({
        endpoint: url,
        method: 'POST',
        headers: debugHeaders(config),
        body,
    })
    const response = await checkedFetch(url, {
        method: 'POST',
        headers: authHeaders(config),
        body: JSON.stringify(body),
        signal: request.signal,
    })
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/event-stream')) {
        const value = (await response.json()) as Record<string, unknown>
        if (value.error) throw providerPayloadError(value.error)
        const choice = Array.isArray(value.choices) ? value.choices[0] : undefined
        const text = objectValue(choice)?.text
        if (typeof text !== 'string') {
            throw new ProviderError(
                'invalid_provider_response',
                `${config.provider} returned no completion text`,
            )
        }
        yield { delta: text }
        return
    }
    if (!response.body) {
        throw new ProviderError('invalid_provider_response', 'Provider returned an empty stream')
    }
    for await (const event of parseSse(response.body as unknown as ReadableStream<Uint8Array>)) {
        if (event.data === '[DONE]') break
        const value = jsonObject(event.data, config.provider)
        if (value.error) throw providerPayloadError(value.error)
        const choice = Array.isArray(value.choices) ? value.choices[0] : undefined
        const text = objectValue(choice)?.text
        if (typeof text === 'string') yield { delta: text }
    }
}

function baseUrl(config: RuntimeProviderConfig): string {
    const value = config.baseUrl || defaultBases[config.provider]
    if (!value) {
        throw new ProviderError(
            'provider_unreachable',
            `${config.provider} requires a compatible API base URL`,
        )
    }
    return value
}

function authHeaders(config: RuntimeProviderConfig): Record<string, string> {
    return {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        ...(config.provider === 'openai' ? { 'OpenAI-Beta': 'responses=v1' } : {}),
        ...(config.provider === 'openrouter' && stringOption(config, 'httpReferer')
            ? { 'HTTP-Referer': stringOption(config, 'httpReferer')! }
            : {}),
        ...(config.provider === 'openrouter' && stringOption(config, 'appTitle')
            ? { 'X-Title': stringOption(config, 'appTitle')! }
            : {}),
    }
}

function debugHeaders(config: RuntimeProviderConfig): Record<string, string> {
    return {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: 'Bearer [redacted]' } : {}),
        ...(config.provider === 'openrouter' && stringOption(config, 'httpReferer')
            ? { 'HTTP-Referer': stringOption(config, 'httpReferer')! }
            : {}),
        ...(config.provider === 'openrouter' && stringOption(config, 'appTitle')
            ? { 'X-Title': stringOption(config, 'appTitle')! }
            : {}),
    }
}

function openAIParameters(parameters: GenerationParameters) {
    return {
        temperature: parameters.temperature,
        top_p: parameters.topP,
        frequency_penalty: parameters.frequencyPenalty,
        presence_penalty: parameters.presencePenalty,
        max_tokens: parameters.maxOutputTokens,
        stop: parameters.stopSequences,
    }
}

function logitBiasBody(
    config: RuntimeProviderConfig,
    bias: GenerationBias | undefined,
): { logit_bias?: Record<number, number> } {
    if (!bias || !sendsOpenAILogitBias(config)) return {}
    const logitBias = openAILogitBias(bias)
    return Object.keys(logitBias).length ? { logit_bias: logitBias } : {}
}

function providerBody(config: RuntimeProviderConfig): Record<string, unknown> {
    const value = config.providerOptions?.customBody
    const body =
        value && typeof value === 'object' && !Array.isArray(value)
            ? { ...(value as Record<string, unknown>) }
            : {}
    if (config.provider === 'openrouter') {
        const routing = config.providerOptions?.routing
        if (routing && typeof routing === 'object' && !Array.isArray(routing)) {
            body.provider = routing
        }
        if (config.providerOptions?.middleOut === true) body.transforms = ['middle-out']
    }
    return body
}

function stringOption(config: RuntimeProviderConfig, key: string): string | undefined {
    const value = config.providerOptions?.[key]
    return typeof value === 'string' && value ? value : undefined
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function numberValue(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined
}

function textContent(value: unknown): string {
    if (typeof value === 'string') return value
    if (!Array.isArray(value)) return ''
    return value
        .map((part) => (objectValue(part)?.type === 'text' ? objectValue(part)?.text : ''))
        .filter((part): part is string => typeof part === 'string')
        .join('')
}

function providerPayloadError(value: unknown): ProviderError {
    const object = objectValue(value)
    const message =
        (typeof object?.message === 'string' && object.message) ||
        (typeof value === 'string' && value) ||
        'Provider returned an error'
    return new ProviderError('invalid_provider_response', message)
}

export function promptFromMessages(messages: CompiledMessage[]): string {
    return messages.map((message) => `${message.role}: ${message.content}`).join('\n\n')
}

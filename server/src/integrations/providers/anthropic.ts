import { endpoint, jsonObject, parseSse } from './http-stream'
import {
    checkedFetch,
    type ProviderAdapter,
    type ProviderChunk,
    ProviderError,
    type ProviderModel,
    type RuntimeProviderConfig,
} from './types'

export class AnthropicAdapter implements ProviderAdapter {
    readonly kind = 'anthropic' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (!config.modelId) throw new ProviderError('model_not_found', 'A model ID is required')
        if (!config.apiKey)
            throw new ProviderError('provider_auth', 'Anthropic requires an API key')
    }

    async healthCheck(config: RuntimeProviderConfig) {
        const models = await this.listModels(config)
        return { ok: true, message: `Anthropic: ${models.length} models available` }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        const response = await checkedFetch(endpoint(baseUrl(config), '/models'), {
            headers: headers(config),
            signal: AbortSignal.timeout(15_000),
        })
        const body = (await response.json()) as { data?: Array<Record<string, unknown>> }
        return (body.data || [])
            .map((model) => ({
                id: typeof model.id === 'string' ? model.id : '',
                name:
                    typeof model.display_name === 'string'
                        ? model.display_name
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
        const shaped = toAnthropicMessages(request.messages)
        const url = endpoint(baseUrl(config), '/messages')
        const body = {
            model: config.modelId,
            messages: shaped.messages,
            ...(shaped.system ? { system: shaped.system } : {}),
            stream: true,
            max_tokens: request.parameters.maxOutputTokens ?? 2048,
            temperature: request.parameters.temperature,
            top_p: request.parameters.topP,
            top_k: request.parameters.topK,
            stop_sequences: request.parameters.stopSequences,
        }
        request.onRequest?.({
            endpoint: url,
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'anthropic-version': '2023-06-01',
                'x-api-key': '[redacted]',
            },
            body,
        })
        const response = await checkedFetch(url, {
            method: 'POST',
            headers: headers(config),
            body: JSON.stringify(body),
            signal: request.signal,
        })
        if (!response.body)
            throw new ProviderError(
                'invalid_provider_response',
                'Anthropic returned an empty stream',
            )
        let inputTokens: number | undefined
        for await (const event of parseSse(
            response.body as unknown as ReadableStream<Uint8Array>,
        )) {
            const value = jsonObject(event.data, 'Anthropic')
            const type = typeof value.type === 'string' ? value.type : event.event
            if (type === 'error') {
                const error = objectValue(value.error)
                throw new ProviderError(
                    'invalid_provider_response',
                    typeof error?.message === 'string' ? error.message : 'Anthropic stream failed',
                )
            }
            if (type === 'message_start') {
                inputTokens = numberValue(
                    objectValue(objectValue(value.message)?.usage)?.input_tokens,
                )
            } else if (type === 'content_block_delta') {
                const delta = objectValue(value.delta)
                if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                    yield { delta: delta.text }
                }
            } else if (type === 'message_delta') {
                const outputTokens = numberValue(objectValue(value.usage)?.output_tokens)
                if (inputTokens !== undefined || outputTokens !== undefined) {
                    yield { delta: '', usage: { inputTokens, outputTokens } }
                }
            }
        }
    }
}

function baseUrl(config: RuntimeProviderConfig): string {
    return config.baseUrl || 'https://api.anthropic.com/v1'
}

function headers(config: RuntimeProviderConfig): Record<string, string> {
    return {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': config.apiKey || '',
    }
}

export function toAnthropicMessages(messages: Array<{ role: string; content: string }>): {
    system: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
} {
    const result: Array<{ role: 'user' | 'assistant'; content: string }> = []
    let system = ''
    for (const message of messages) {
        if (message.role === 'system' && result.length === 0) {
            system += `${system ? '\n\n' : ''}${message.content}`
            continue
        }
        const role = message.role === 'assistant' ? 'assistant' : 'user'
        const content = message.role === 'system' ? `System: ${message.content}` : message.content
        const previous = result.at(-1)
        if (previous?.role === role) previous.content += `\n\n${content}`
        else result.push({ role, content })
    }
    if (!result.length) result.push({ role: 'user', content: system || 'Start' })
    if (result[0]?.role !== 'user') result.unshift({ role: 'user', content: 'Start' })
    return {
        system: result.length === 1 && result[0]?.content === system ? '' : system,
        messages: result,
    }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function numberValue(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined
}

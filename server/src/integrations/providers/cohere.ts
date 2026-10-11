import {
    checkedFetch,
    type ProviderAdapter,
    type ProviderChunk,
    ProviderError,
    type ProviderModel,
    type RuntimeProviderConfig,
} from './types'

export class CohereAdapter implements ProviderAdapter {
    readonly kind = 'cohere' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (!config.modelId) throw new ProviderError('model_not_found', 'A model ID is required')
        if (!config.apiKey) throw new ProviderError('provider_auth', 'Cohere requires an API key')
    }

    async healthCheck(config: RuntimeProviderConfig) {
        const models = await this.listModels(config)
        return { ok: true, message: `Cohere: ${models.length} models available` }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        const response = await checkedFetch(`${baseUrl(config)}/v1/models`, {
            headers: headers(config),
            signal: AbortSignal.timeout(15_000),
        })
        const body = (await response.json()) as { models?: Array<Record<string, unknown>> }
        return (body.models || [])
            .map((model) => ({
                id: typeof model.name === 'string' ? model.name : '',
                name: typeof model.name === 'string' ? model.name : '',
                details: model,
            }))
            .filter((model) => model.id)
    }

    async *streamChat(
        config: RuntimeProviderConfig,
        request: Parameters<ProviderAdapter['streamChat']>[1],
    ): AsyncGenerator<ProviderChunk> {
        this.validateConfig(config)
        const shaped = shapeMessages(request.messages)
        const url = `${baseUrl(config)}/v1/chat`
        const body = {
            model: config.modelId,
            message: shaped.message,
            chat_history: shaped.history,
            ...(shaped.preamble ? { preamble: shaped.preamble } : {}),
            safety_mode: 'NONE',
            temperature: request.parameters.temperature,
            p: request.parameters.topP,
            k: request.parameters.topK,
            max_tokens: request.parameters.maxOutputTokens,
            stop_sequences: request.parameters.stopSequences,
        }
        request.onRequest?.({
            endpoint: url,
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer [redacted]' },
            body,
        })
        const response = await checkedFetch(url, {
            method: 'POST',
            headers: headers(config),
            body: JSON.stringify(body),
            signal: request.signal,
        })
        const result = (await response.json()) as Record<string, unknown>
        if (typeof result.text !== 'string') {
            throw new ProviderError('invalid_provider_response', 'Cohere returned no text')
        }
        const meta = objectValue(result.meta)
        const billed = objectValue(meta?.billed_units)
        yield {
            delta: result.text,
            usage: billed
                ? {
                      inputTokens: numberValue(billed.input_tokens),
                      outputTokens: numberValue(billed.output_tokens),
                  }
                : undefined,
        }
    }
}

function baseUrl(config: RuntimeProviderConfig): string {
    return (config.baseUrl || 'https://api.cohere.com').replace(/\/+$/, '')
}

function headers(config: RuntimeProviderConfig) {
    return { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey || ''}` }
}

function shapeMessages(messages: Array<{ role: string; content: string }>) {
    const queue = [...messages]
    const preamble = queue[0]?.role === 'system' ? queue.shift()?.content || '' : ''
    let last = queue.pop()
    while (last && last.role !== 'user') {
        const previous = queue.pop()
        last = previous
            ? { ...previous, content: `${previous.content}\n${last.role}: ${last.content}` }
            : { role: 'user', content: `${last.role}: ${last.content}` }
    }
    return {
        preamble,
        message: last?.content || 'Start',
        history: queue.map((message) => ({
            role:
                message.role === 'assistant'
                    ? 'CHATBOT'
                    : message.role === 'system'
                      ? 'SYSTEM'
                      : 'USER',
            message: message.content,
        })),
    }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function numberValue(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined
}

import {
    checkedFetch,
    type ProviderAdapter,
    type ProviderChunk,
    ProviderError,
    type ProviderModel,
    type RuntimeProviderConfig,
} from './types'

export class OllamaAdapter implements ProviderAdapter {
    readonly kind = 'ollama' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (config.provider !== 'ollama')
            throw new ProviderError('invalid_provider_response', 'Expected an Ollama configuration')
        const url = new URL(config.baseUrl)
        if (!['http:', 'https:'].includes(url.protocol))
            throw new ProviderError('provider_unreachable', 'Ollama URL must use HTTP or HTTPS')
    }

    async healthCheck(config: RuntimeProviderConfig) {
        this.validateConfig(config)
        if (config.provider !== 'ollama')
            throw new ProviderError('invalid_provider_response', 'Expected an Ollama configuration')
        const response = await checkedFetch(`${baseUrl(config)}/api/version`, {
            signal: AbortSignal.timeout(10_000),
        })
        const body = (await response.json()) as { version?: string }
        return {
            ok: true,
            message: body.version ? `Ollama ${body.version}` : 'Ollama is reachable',
        }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        if (config.provider !== 'ollama') return []
        const response = await checkedFetch(`${baseUrl(config)}/api/tags`, {
            signal: AbortSignal.timeout(10_000),
        })
        const body = (await response.json()) as { models?: Array<Record<string, unknown>> }
        return (body.models || [])
            .map((model) => ({
                id: stringValue(model.model) || stringValue(model.name),
                name: stringValue(model.name) || stringValue(model.model),
                details:
                    model.details && typeof model.details === 'object'
                        ? (model.details as Record<string, unknown>)
                        : undefined,
            }))
            .filter((model) => model.id)
    }

    async *streamChat(
        config: RuntimeProviderConfig,
        request: Parameters<ProviderAdapter['streamChat']>[1],
    ): AsyncGenerator<ProviderChunk> {
        this.validateConfig(config)
        if (config.provider !== 'ollama') return
        const options: Record<string, unknown> = {}
        if (request.parameters.temperature !== undefined)
            options.temperature = request.parameters.temperature
        if (request.parameters.topP !== undefined) options.top_p = request.parameters.topP
        if (request.parameters.topK !== undefined) options.top_k = request.parameters.topK
        if (request.parameters.minP !== undefined) options.min_p = request.parameters.minP
        if (request.parameters.repetitionPenalty !== undefined)
            options.repeat_penalty = request.parameters.repetitionPenalty
        if (request.parameters.frequencyPenalty !== undefined)
            options.frequency_penalty = request.parameters.frequencyPenalty
        if (request.parameters.presencePenalty !== undefined)
            options.presence_penalty = request.parameters.presencePenalty
        if (request.parameters.maxContextTokens !== undefined)
            options.num_ctx = request.parameters.maxContextTokens
        if (request.parameters.maxOutputTokens !== undefined)
            options.num_predict = request.parameters.maxOutputTokens
        if (request.parameters.stopSequences !== undefined)
            options.stop = request.parameters.stopSequences

        const endpoint = `${baseUrl(config)}/api/chat`
        const body = {
            model: config.modelId,
            messages: request.messages,
            stream: true,
            options,
        }
        request.onRequest?.({
            endpoint: redactUrlCredentials(endpoint),
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
        })
        const response = await checkedFetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: request.signal,
        })
        if (!response.body)
            throw new ProviderError('invalid_provider_response', 'Ollama returned an empty body')
        for await (const value of parseNdjson(
            response.body as unknown as ReadableStream<Uint8Array>,
        )) {
            const message = value.message as { content?: string } | undefined
            const delta = message?.content || ''
            const usage = value.done
                ? {
                      inputTokens:
                          typeof value.prompt_eval_count === 'number'
                              ? value.prompt_eval_count
                              : undefined,
                      outputTokens:
                          typeof value.eval_count === 'number' ? value.eval_count : undefined,
                  }
                : undefined
            if (delta || usage) yield { delta, usage }
        }
    }
}

function baseUrl(config: Extract<RuntimeProviderConfig, { provider: 'ollama' }>): string {
    return config.baseUrl.replace(/\/+$/, '')
}

function redactUrlCredentials(value: string): string {
    const url = new URL(value)
    if (url.username) url.username = '[redacted]'
    if (url.password) url.password = '[redacted]'
    return url.toString()
}

export async function* parseNdjson(
    stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            while (true) {
                const newline = buffer.indexOf('\n')
                if (newline === -1) break
                const line = buffer.slice(0, newline).trim()
                buffer = buffer.slice(newline + 1)
                if (line) yield parseLine(line)
            }
        }
        buffer += decoder.decode()
        if (buffer.trim()) yield parseLine(buffer.trim())
    } finally {
        reader.releaseLock()
    }
}

function parseLine(line: string): Record<string, unknown> {
    try {
        const value = JSON.parse(line) as Record<string, unknown>
        if (value.error) {
            throw new ProviderError(
                'invalid_provider_response',
                stringValue(value.error) || 'Ollama returned an unknown error',
            )
        }
        return value
    } catch (error) {
        if (error instanceof ProviderError) throw error
        throw new ProviderError('invalid_provider_response', 'Ollama returned malformed NDJSON')
    }
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

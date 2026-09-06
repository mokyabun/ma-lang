import {
    buildPocketRisuGeminiBody,
    fetchGemini,
    pocketRisuGeminiHeaders,
    streamGeminiRest,
    toPocketRisuGeminiPrompt,
} from './gemini-rest'
import {
    type ProviderAdapter,
    type ProviderChunk,
    ProviderError,
    type ProviderModel,
    type RuntimeProviderConfig,
} from './types'

export class GoogleAIStudioAdapter implements ProviderAdapter {
    readonly kind = 'google' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (!config.modelId) throw new ProviderError('model_not_found', 'A model ID is required')
        if (!config.apiKey)
            throw new ProviderError('provider_auth', 'Google AI Studio requires an API key')
    }

    async healthCheck(config: RuntimeProviderConfig) {
        this.validateConfig(config)
        await fetchGemini(
            googleUrl(config, 'countTokens'),
            {
                method: 'POST',
                headers: googleHeaders(config),
                body: JSON.stringify(toPocketRisuGeminiPrompt([{ role: 'user', content: 'ping' }])),
            },
            'Google AI Studio',
        )
        return { ok: true, message: 'Google AI Studio credentials and model are available' }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        const response = await fetchGemini(
            `${googleApiBase(config)}/models`,
            { headers: googleHeaders(config) },
            'Google AI Studio',
        )
        const data = (await response.json()) as {
            models?: Array<{ name?: string; displayName?: string }>
        }
        return (data.models || []).flatMap((model) => {
            if (!model.name) return []
            const id = model.name.replace(/^models\//, '')
            return [{ id, name: model.displayName || id }]
        })
    }

    async *streamChat(
        config: RuntimeProviderConfig,
        request: Parameters<ProviderAdapter['streamChat']>[1],
    ): AsyncGenerator<ProviderChunk> {
        this.validateConfig(config)
        const body = buildPocketRisuGeminiBody(config, request.messages, request.parameters)
        const url = googleUrl(config, 'streamGenerateContent')
        const headers = googleHeaders(config)
        request.onRequest?.({
            endpoint: url,
            method: 'POST',
            headers: { ...headers, 'x-goog-api-key': '[redacted]' },
            body,
        })
        yield* streamGeminiRest(url, headers, body, request.signal, 'Google AI Studio')
    }
}

function googleApiBase(config: RuntimeProviderConfig): string {
    if (!config.baseUrl) return 'https://generativelanguage.googleapis.com/v1beta'
    return config.baseUrl.replace(/\/+$/, '').replace(/\/models$/, '')
}

function googleUrl(
    config: RuntimeProviderConfig,
    method: 'countTokens' | 'streamGenerateContent',
): string {
    const suffix =
        method === 'streamGenerateContent' ? ':streamGenerateContent?alt=sse' : ':countTokens'
    return `${googleApiBase(config)}/models/${encodeURIComponent(config.modelId)}${suffix}`
}

function googleHeaders(config: RuntimeProviderConfig): Record<string, string> {
    return {
        ...pocketRisuGeminiHeaders(config),
        'x-goog-api-key': config.apiKey || '',
    }
}

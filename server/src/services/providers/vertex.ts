import { GoogleAuth } from 'google-auth-library'

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

const CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

export class VertexAdapter implements ProviderAdapter {
    readonly kind = 'vertex' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (config.provider !== 'vertex')
            throw new ProviderError('invalid_provider_response', 'Expected a Vertex configuration')
        if (
            !config.modelId ||
            (!config.apiKey && !config.serviceAccount && (!config.projectId || !config.location))
        )
            throw new ProviderError(
                'provider_unreachable',
                'Vertex requires a model and an API key, service-account JSON, or project/location with ADC',
            )
    }

    async healthCheck(config: RuntimeProviderConfig) {
        this.validateConfig(config)
        if (config.provider !== 'vertex')
            return { ok: false, message: 'Invalid Vertex configuration' }
        const request = await vertexRequest(config, 'countTokens')
        await fetchGemini(
            request.url,
            {
                method: 'POST',
                headers: request.headers,
                body: JSON.stringify(toPocketRisuGeminiPrompt([{ role: 'user', content: 'ping' }])),
            },
            'Vertex AI',
        )
        return { ok: true, message: 'Vertex AI credentials and model are available' }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        return [{ id: config.modelId, name: config.modelId }]
    }

    async *streamChat(
        config: RuntimeProviderConfig,
        request: Parameters<ProviderAdapter['streamChat']>[1],
    ): AsyncGenerator<ProviderChunk> {
        this.validateConfig(config)
        if (config.provider !== 'vertex') return
        const body = buildPocketRisuGeminiBody(config, request.messages, request.parameters)
        const prepared = await vertexRequest(config, 'streamGenerateContent')
        request.onRequest?.({
            endpoint: prepared.debugUrl,
            method: 'POST',
            headers: redactHeaders(prepared.headers),
            body,
        })
        yield* streamGeminiRest(prepared.url, prepared.headers, body, request.signal, 'Vertex AI')
    }
}

// Kept for callers/tests that used the old name. The behavior now follows
// PocketRisu's current Model Preset google-gemini adapter.
export const toGeminiContents = toPocketRisuGeminiPrompt

async function vertexRequest(
    config: Extract<RuntimeProviderConfig, { provider: 'vertex' }>,
    method: 'countTokens' | 'streamGenerateContent',
): Promise<{ url: string; debugUrl: string; headers: Record<string, string> }> {
    const headers = pocketRisuGeminiHeaders(config)
    let url = `${vertexBaseUrl(config)}/${encodeURIComponent(config.modelId)}:${method}`
    if (method === 'streamGenerateContent') url += '?alt=sse'

    if (config.apiKey && !config.serviceAccount) {
        const parsed = new URL(url)
        parsed.searchParams.set('key', config.apiKey)
        return { url: parsed.toString(), debugUrl: redactUrl(parsed), headers }
    }

    const auth = new GoogleAuth({
        ...(config.serviceAccount ? { credentials: config.serviceAccount } : {}),
        ...(config.projectId ? { projectId: config.projectId } : {}),
        scopes: [CLOUD_SCOPE],
    })
    const client = await auth.getClient()
    const tokenResult = await client.getAccessToken()
    const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token
    if (!token)
        throw new ProviderError('provider_auth', 'Vertex AI could not obtain an access token')
    headers.Authorization = `Bearer ${token}`
    return { url, debugUrl: url, headers }
}

function vertexBaseUrl(config: Extract<RuntimeProviderConfig, { provider: 'vertex' }>): string {
    if (config.baseUrl) return config.baseUrl.replace(/\/+$/, '')
    const project = config.projectId || config.serviceAccount?.project_id
    if (!project) return 'https://aiplatform.googleapis.com/v1/publishers/google/models'
    const location = config.location || 'global'
    const host =
        location === 'global'
            ? 'aiplatform.googleapis.com'
            : `${location}-aiplatform.googleapis.com`
    return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models`
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [
            key,
            /authorization|api[-_]?key/i.test(key) ? '[redacted]' : value,
        ]),
    )
}

function redactUrl(url: URL): string {
    const result = new URL(url)
    if (result.searchParams.has('key')) result.searchParams.set('key', '[redacted]')
    return result.toString()
}

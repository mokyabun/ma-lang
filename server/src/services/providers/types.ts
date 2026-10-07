import type {
    CompiledMessage,
    GenerationParameters,
    ProviderConfig,
    RequestDebugSnapshot,
} from '@malang/shared'

import { AppError, type AppErrorKind } from '@/errors/app-error'

import type { GenerationBias } from './bias'

export interface ServiceAccountCredentials {
    type: 'service_account'
    project_id: string
    private_key_id?: string
    private_key: string
    client_email: string
    client_id?: string
    auth_uri?: string
    token_uri?: string
    auth_provider_x509_cert_url?: string
    client_x509_cert_url?: string
    universe_domain?: string
}

type RuntimeSecrets = {
    providerOptions?: Record<string, unknown>
    apiKey?: string
    serviceAccount?: ServiceAccountCredentials
    awsSecretAccessKey?: string
    awsSessionToken?: string
}

type RuntimeConfig<T> = T extends ProviderConfig
    ? Omit<T, 'providerOptions'> & RuntimeSecrets
    : never

export type RuntimeProviderConfig = RuntimeConfig<ProviderConfig>

export interface ProviderUsage {
    inputTokens?: number
    outputTokens?: number
}

export interface ProviderChunk {
    delta: string
    usage?: ProviderUsage
}

export interface ProviderModel {
    id: string
    name: string
    details?: Record<string, unknown>
}

export interface ProviderAdapter {
    readonly kind: ProviderConfig['provider']
    validateConfig(config: RuntimeProviderConfig): void
    healthCheck(config: RuntimeProviderConfig): Promise<{ ok: boolean; message: string }>
    listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]>
    streamChat(
        config: RuntimeProviderConfig,
        request: {
            messages: CompiledMessage[]
            parameters: GenerationParameters
            /** Only the main chat request carries bias, as in PocketRisu. */
            bias?: GenerationBias
            signal: AbortSignal
            onRequest?: (snapshot: RequestDebugSnapshot) => void
        },
    ): AsyncGenerator<ProviderChunk>
}

export type ProviderErrorCode =
    | 'provider_auth'
    | 'provider_unreachable'
    | 'model_not_found'
    | 'rate_limited'
    | 'safety_blocked'
    | 'invalid_provider_response'

export class ProviderError extends AppError {
    constructor(code: ProviderErrorCode, message: string) {
        super(providerErrorKind(code), message)
    }
}

function providerErrorKind(code: ProviderErrorCode): AppErrorKind {
    return code
}

export async function checkedFetch(url: string, init: RequestInit): Promise<Response> {
    try {
        const response = await fetch(url, init)
        if (response.status === 401 || response.status === 403)
            throw new ProviderError('provider_auth', 'Provider rejected the configured credentials')
        if (response.status === 404)
            throw new ProviderError('model_not_found', 'Provider endpoint or model was not found')
        if (response.status === 429)
            throw new ProviderError('rate_limited', 'Provider rate limit exceeded')
        if (!response.ok)
            throw new ProviderError(
                'provider_unreachable',
                `Provider returned HTTP ${response.status}`,
            )
        return response
    } catch (error) {
        if (error instanceof ProviderError) throw error
        if (init.signal?.aborted) throw error
        throw new ProviderError(
            'provider_unreachable',
            error instanceof Error ? error.message : 'Provider request failed',
        )
    }
}

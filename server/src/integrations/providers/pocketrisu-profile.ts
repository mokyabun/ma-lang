import {
    type ModelPreset,
    type ModelPresetInput,
    POCKET_RISU_PROFILE_OPTION,
    type PocketRisuModelProfileEnvelope,
    PocketRisuModelProfileEnvelopeSchema,
    type PocketRisuProfileBinding,
    PocketRisuProfileBindingSchema,
    type PocketRisuProfileField,
    type ProviderConfig,
    type ProviderKind,
    ProviderConfigSchema,
} from '@malang/shared'

import { ValidationError } from '@/lib/errors/app-error'

export class ModelProfileFormatError extends ValidationError {}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export function importPocketRisuModelProfile(bytes: Uint8Array): ModelPresetInput {
    let raw: unknown
    try {
        raw = JSON.parse(decoder.decode(bytes))
    } catch {
        throw new ModelProfileFormatError('모델 프로필 JSON을 읽을 수 없습니다.')
    }

    const result = PocketRisuModelProfileEnvelopeSchema.safeParse(raw)
    if (!result.success) {
        throw new ModelProfileFormatError(
            '지원하지 않는 모델 프로필입니다. schemaVersion 1 형식인지 확인해 주세요.',
        )
    }

    const envelope = stripProfileSecrets(result.data)
    const profile = envelope.profile
    const values = profileValues(profile)
    const provider = pocketProviderKind(envelope)
    const defaults = generationDefaults(values)
    const providerOptions: Record<string, unknown> = {}

    for (const field of profile.schema) {
        if (field.secret || field.mapsTo?.target === 'auth') continue
        if (isNativeField(field.key)) continue
        if (values[field.key] !== undefined) providerOptions[field.key] = values[field.key]
    }

    const binding: PocketRisuProfileBinding = { envelope, values }
    providerOptions[POCKET_RISU_PROFILE_OPTION] = binding

    const common = {
        provider,
        modelId: stringValue(values.modelId) || profile.modelId,
        defaults,
        providerOptions,
        credentialType: credentialType(profile.auth.kind),
        ...optionalBaseUrl(values.endpointUrl),
        ...apiFormat(envelope.baseProvider.adapterKind),
    }

    let config: ProviderConfig
    if (provider === 'vertex') {
        config = {
            ...common,
            provider,
            projectId: stringValue(values.projectId),
            location: stringValue(values.location) || 'global',
        }
    } else if (provider === 'aws') {
        config = {
            ...common,
            provider,
            region: stringValue(values.region) || 'us-east-1',
        }
    } else {
        config = common as ProviderConfig
    }

    const parsedConfig = ProviderConfigSchema.safeParse(config)
    if (!parsedConfig.success) {
        throw new ModelProfileFormatError(
            '프로필의 Provider 설정을 서버 런타임 설정으로 변환하지 못했습니다.',
        )
    }
    return { name: profile.displayName, config: parsedConfig.data, apiKeyId: null }
}

export function exportPocketRisuModelProfile(preset: ModelPreset): Uint8Array {
    const binding = readPocketRisuProfileBinding(preset.config.providerOptions)
    const envelope = binding ? structuredClone(binding.envelope) : createEnvelopeForPreset(preset)
    const values = valuesFromPreset(preset, binding?.values ?? {})
    const now = Date.now()

    envelope.exportedAt = now
    envelope.profile.updatedAt = now
    envelope.profile.displayName = preset.name
    envelope.profile.modelId = preset.config.modelId
    envelope.profile.defaults = {
        ...envelope.profile.defaults,
        ...Object.fromEntries(
            Object.entries(values).filter(([key, value]) => {
                const field = envelope.profile.schema.find((item) => item.key === key)
                return value !== undefined && !field?.secret && field?.mapsTo?.target !== 'auth'
            }),
        ),
    }
    envelope.profile.schema = envelope.profile.schema.map((field) => {
        if (field.secret || field.mapsTo?.target === 'auth') {
            const { default: _secretDefault, ...safeField } = field
            return safeField as PocketRisuProfileField
        }
        return values[field.key] === undefined ? field : { ...field, default: values[field.key] }
    })

    return encoder.encode(`${JSON.stringify(envelope, null, 2)}\n`)
}

export function readPocketRisuProfileBinding(
    providerOptions: Record<string, unknown> | undefined,
): PocketRisuProfileBinding | null {
    const result = PocketRisuProfileBindingSchema.safeParse(
        providerOptions?.[POCKET_RISU_PROFILE_OPTION],
    )
    return result.success ? result.data : null
}

export function pocketRisuProfileHeaders(
    providerOptions: Record<string, unknown> | undefined,
): Record<string, string> {
    const binding = readPocketRisuProfileBinding(providerOptions)
    const headers = { ...binding?.envelope.profile.headerTemplate }
    const sharedRequestType = binding?.values.sharedRequestType
    if (typeof sharedRequestType === 'string' && sharedRequestType) {
        headers['X-Vertex-AI-LLM-Shared-Request-Type'] = sharedRequestType
    }
    return headers
}

function stripProfileSecrets(
    input: PocketRisuModelProfileEnvelope,
): PocketRisuModelProfileEnvelope {
    const envelope = structuredClone(input)
    const secretKeys = new Set(
        envelope.profile.schema
            .filter((field) => field.secret || field.mapsTo?.target === 'auth')
            .map((field) => field.key),
    )
    envelope.profile.defaults = Object.fromEntries(
        Object.entries(envelope.profile.defaults).filter(([key]) => !secretKeys.has(key)),
    )
    envelope.profile.schema = envelope.profile.schema.map((field) => {
        if (!secretKeys.has(field.key)) return field
        const { default: _secretDefault, ...safeField } = field
        return safeField as PocketRisuProfileField
    })
    return envelope
}

function profileValues(profile: PocketRisuModelProfileEnvelope['profile']) {
    const values: Record<string, unknown> = { ...profile.defaults }
    for (const field of profile.schema) {
        if (field.secret || field.mapsTo?.target === 'auth') continue
        if (values[field.key] === undefined && field.default !== undefined) {
            values[field.key] = field.default
        }
    }
    values.modelId ??= profile.modelId
    return values
}

function generationDefaults(values: Record<string, unknown>) {
    const result: Record<string, unknown> = {}
    const numberKeys = [
        'temperature',
        'topP',
        'topK',
        'minP',
        'topA',
        'repetitionPenalty',
        'frequencyPenalty',
        'presencePenalty',
        'maxContextTokens',
        'maxOutputTokens',
    ] as const
    for (const key of numberKeys) {
        if (typeof values[key] === 'number' && Number.isFinite(values[key]))
            result[key] = values[key]
    }
    if (
        Array.isArray(values.stopSequences) &&
        values.stopSequences.every((value) => typeof value === 'string')
    ) {
        result.stopSequences = values.stopSequences
    }
    return result
}

function valuesFromPreset(preset: ModelPreset, stored: Record<string, unknown>) {
    const config = preset.config
    const runtimeOptions = { ...config.providerOptions }
    delete runtimeOptions[POCKET_RISU_PROFILE_OPTION]
    const values: Record<string, unknown> = {
        ...stored,
        ...runtimeOptions,
        ...config.defaults,
        modelId: config.modelId,
        endpointUrl: config.baseUrl ?? '',
    }
    if (config.provider === 'vertex') {
        values.location = config.location
        values.projectId = config.projectId
    }
    if (config.provider === 'aws') values.region = config.region
    return values
}

function pocketProviderKind(envelope: PocketRisuModelProfileEnvelope): ProviderKind {
    const baseId = envelope.profile.providerBaseId.toLowerCase()
    const endpoint = envelope.profile.endpoint.kind.toLowerCase()
    const adapter = envelope.baseProvider.adapterKind.toLowerCase()
    if (endpoint.includes('vertex') || baseId.includes('vertex')) return 'vertex'
    if (endpoint.includes('bedrock') || adapter.includes('bedrock')) return 'aws'
    if (baseId.includes('openrouter')) return 'openrouter'
    if (baseId.includes('anthropic') || adapter.includes('anthropic')) return 'anthropic'
    if (baseId.includes('cohere') || adapter.includes('cohere')) return 'cohere'
    if (baseId.includes('ollama') || adapter.includes('ollama')) return 'ollama'
    if (baseId.includes('mistral')) return 'mistral'
    if (baseId.includes('deepseek')) return 'deepseek'
    if (baseId.includes('deepinfra')) return 'deepinfra'
    if (baseId.includes('nanogpt')) return 'nanogpt'
    if (baseId.includes('novelai')) return 'novelai'
    if (baseId.includes('novellist')) return 'novellist'
    if (baseId.includes('horde')) return 'horde'
    if (baseId.includes('kobold')) return 'kobold'
    if (baseId.includes('ooba')) return 'ooba'
    if (baseId.includes('mancer')) return 'mancer'
    if (baseId.includes('google') || adapter.includes('google')) return 'google'
    if (baseId === 'openai' || baseId.startsWith('openai-')) return 'openai'
    if (adapter.includes('openai')) return 'openai-compatible'
    throw new ModelProfileFormatError(
        `Provider '${envelope.profile.providerBaseId}'는 아직 지원하지 않습니다.`,
    )
}

function credentialType(kind: string): ProviderConfig['credentialType'] {
    const normalized = kind.toLowerCase()
    if (normalized.includes('service-account')) return 'serviceAccount'
    if (normalized.includes('aws')) return 'aws'
    if (normalized === 'none') return 'none'
    return 'apiKey'
}

function apiFormat(adapter: string): Pick<ProviderConfig, 'apiFormat'> | object {
    const normalized = adapter.toLowerCase()
    if (normalized.includes('openai')) return { apiFormat: 'openai-chat' as const }
    if (normalized.includes('anthropic')) return { apiFormat: 'anthropic-messages' as const }
    if (normalized.includes('cohere')) return { apiFormat: 'cohere-chat' as const }
    if (normalized.includes('google')) return { apiFormat: 'google-gemini' as const }
    return {}
}

function optionalBaseUrl(value: unknown): Pick<ProviderConfig, 'baseUrl'> | object {
    const candidate = stringValue(value)
    if (!candidate) return {}
    try {
        const url = new URL(candidate)
        return ['http:', 'https:'].includes(url.protocol) ? { baseUrl: candidate } : {}
    } catch {
        return {}
    }
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function isNativeField(key: string) {
    return [
        'modelId',
        'endpointUrl',
        'projectId',
        'location',
        'region',
        'temperature',
        'topP',
        'topK',
        'minP',
        'topA',
        'repetitionPenalty',
        'frequencyPenalty',
        'presencePenalty',
        'maxContextTokens',
        'maxOutputTokens',
        'stopSequences',
    ].includes(key)
}

function createEnvelopeForPreset(preset: ModelPreset): PocketRisuModelProfileEnvelope {
    const now = Date.now()
    const providerId = pocketProviderId(preset.config.provider)
    const adapterKind = pocketAdapterKind(preset.config.provider)
    return {
        schemaVersion: 1,
        exportedAt: now,
        profile: {
            id: `${providerId}:${preset.config.modelId}`,
            updatedAt: now,
            displayName: preset.name,
            providerBaseId: providerId,
            profileStatus: 'custom',
            modelId: preset.config.modelId,
            endpoint: { kind: pocketEndpointKind(preset.config.provider) },
            auth: {
                kind: pocketAuthKind(preset.config),
                fields:
                    preset.config.credentialType === 'serviceAccount'
                        ? ['serviceAccountJson']
                        : ['apiKey'],
            },
            defaults: {},
            schema: defaultProfileFields(preset.config),
            uiSchema: {
                groups: [
                    { id: 'model', label: 'Model', order: 1, labelI18n: { ko: '모델' } },
                    {
                        id: 'generation',
                        label: 'Generation',
                        order: 2,
                        labelI18n: { ko: '생성' },
                    },
                ],
                fields: [
                    {
                        key: 'modelId',
                        widget: 'combobox',
                        visibility: 'basic',
                        group: 'model',
                        order: 1,
                    },
                    {
                        key: 'temperature',
                        widget: 'slider',
                        visibility: 'basic',
                        group: 'generation',
                        order: 1,
                    },
                    {
                        key: 'maxOutputTokens',
                        widget: 'number-input',
                        visibility: 'basic',
                        group: 'generation',
                        order: 2,
                    },
                ],
            },
            capabilities: ['streaming'],
            sourceUrls: [],
        },
        baseProvider: {
            id: providerId,
            displayName: providerId,
            adapterKind,
            authKinds: [pocketAuthKind(preset.config)],
            endpointKinds: [pocketEndpointKind(preset.config.provider)],
            requestSchema: [],
            uiSchema: { groups: [], fields: [] },
            sourceUrls: [],
        },
    }
}

function defaultProfileFields(config: ProviderConfig): PocketRisuProfileField[] {
    return [
        {
            key: 'modelId',
            type: 'string',
            label: 'Model ID',
            default: config.modelId,
            mapsTo: { target: 'body', path: 'model' },
        },
        {
            key: 'temperature',
            type: 'number',
            label: 'Temperature',
            min: 0,
            max: 2,
            step: 0.01,
            default: config.defaults.temperature,
            mapsTo: { target: 'body', path: 'temperature' },
        },
        {
            key: 'maxOutputTokens',
            type: 'integer',
            label: 'Max Output Tokens',
            min: 1,
            default: config.defaults.maxOutputTokens,
            mapsTo: { target: 'body', path: 'maxOutputTokens' },
        },
    ]
}

function pocketProviderId(provider: ProviderKind) {
    return provider === 'vertex' ? 'vertex-gemini-native' : provider
}

function pocketAdapterKind(provider: ProviderKind) {
    if (provider === 'vertex' || provider === 'google') return 'google-gemini'
    if (provider === 'anthropic') return 'anthropic'
    if (provider === 'cohere') return 'cohere'
    if (provider === 'aws') return 'aws-bedrock'
    if (provider === 'ollama') return 'ollama'
    return 'openai-compatible'
}

function pocketEndpointKind(provider: ProviderKind) {
    if (provider === 'vertex') return 'vertex-gemini'
    if (provider === 'google') return 'google-gemini'
    if (provider === 'aws') return 'aws-bedrock'
    return provider
}

function pocketAuthKind(config: ProviderConfig) {
    if (config.credentialType === 'serviceAccount') return 'google-service-account'
    if (config.credentialType === 'aws') return 'aws-credentials'
    if (config.credentialType === 'none') return 'none'
    return 'api-key'
}

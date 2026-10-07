import {
    type ModelApiKey,
    type ModelApiKeyInput,
    type ModelDiscoveryInput,
    type ModelPreset,
    type ModelPresetInput,
    ProviderConfigSchema,
    ProviderKindSchema,
    type ProviderConfig,
    type ProviderSettings,
    type ProviderSettingsInput,
} from '@malang/shared'
import { z } from 'zod'

import type { Store } from '@/db'
import { ValidationError } from '@/errors/app-error'
import { providerFor } from '@/services/providers'
import type { RuntimeProviderConfig } from '@/services/providers/types'
import type { ServiceAccountCredentials } from '@/services/providers/types'

import type { SecretVault } from './secret-vault'

export class ProviderConfigurationError extends ValidationError {}

const ServiceAccountSchema = z
    .object({
        type: z.literal('service_account'),
        project_id: z.string().min(1).max(256),
        private_key_id: z.string().optional(),
        private_key: z.string().min(1),
        client_email: z.email(),
        client_id: z.string().optional(),
        auth_uri: z.string().optional(),
        token_uri: z.string().optional(),
        auth_provider_x509_cert_url: z.string().optional(),
        client_x509_cert_url: z.string().optional(),
        universe_domain: z.string().optional(),
    })
    .loose()

const ProviderSecretSchema = z.discriminatedUnion('type', [
    z.object({
        version: z.union([z.literal(1), z.literal(2)]),
        type: z.literal('apiKey'),
        provider: z.string().optional(),
        apiKey: z.string().min(1),
    }),
    z.object({
        version: z.union([z.literal(1), z.literal(2)]),
        type: z.literal('serviceAccount'),
        provider: z.string().optional(),
        serviceAccount: ServiceAccountSchema,
    }),
    z.object({
        version: z.literal(2),
        type: z.literal('aws'),
        provider: z.literal('aws'),
        accessKeyId: z.string().optional(),
        secretAccessKey: z.string().min(1),
        sessionToken: z.string().optional(),
    }),
])

const CredentialBundleSchema = z.object({
    version: z.literal(3),
    credentials: z.record(z.string(), ProviderSecretSchema),
})
type CredentialBundle = z.infer<typeof CredentialBundleSchema>

const LEGACY_CREDENTIAL_ID = '00000000-0000-4000-8000-000000000003'

export class ProviderService {
    constructor(
        private readonly store: Store,
        private readonly vault: SecretVault,
    ) {}

    get(): ProviderSettings | null {
        const config = this.store.provider.get()
        if (!config) return null
        const credentialType =
            config.credentialType ?? (config.provider === 'vertex' ? 'adc' : 'none')
        const configured = this.vault.hasSecret()
        return {
            ...config,
            credentialType,
            apiKeyConfigured: configured && credentialType === 'apiKey',
            serviceAccountConfigured: configured && credentialType === 'serviceAccount',
            awsCredentialsConfigured: configured && credentialType === 'aws',
            apiKeyLocked: this.vault.isLocked(),
        }
    }

    listModelPresets(): ModelPreset[] {
        return this.store.modelPreset.list()
    }

    getModelPreset(id: string): ModelPreset | null {
        return this.store.modelPreset.get(id)
    }

    listApiKeys(): ModelApiKey[] {
        const locked = this.vault.isLocked()
        return this.store.modelApiKey.list().map((row) => ({
            id: row.id,
            name: row.name,
            provider: ProviderKindSchema.parse(row.provider),
            credentialType: row.credentialType,
            hint: row.hint,
            configured: true,
            locked,
            createdAt: new Date(row.createdAt).toISOString(),
            updatedAt: new Date(row.updatedAt).toISOString(),
        }))
    }

    createModelPreset(input: ModelPresetInput): ModelPreset {
        this.validatePresetCredential(input)
        return this.store.modelPreset.create(input)
    }

    updateModelPreset(id: string, input: ModelPresetInput): ModelPreset | null {
        this.validatePresetCredential(input)
        return this.store.modelPreset.update(id, input)
    }

    deleteModelPreset(id: string) {
        return this.store.modelPreset.delete(id)
    }

    async createApiKey(input: ModelApiKeyInput): Promise<ModelApiKey> {
        const secret = credentialSecret(input)
        const row = this.store.modelApiKey.create({
            name: input.name,
            provider: input.provider,
            credentialType: input.credentialType,
            hint: credentialHint(input),
        })
        try {
            const bundle = await this.readCredentialBundle()
            bundle.credentials[row.id] = secret
            await this.vault.set(JSON.stringify(bundle))
        } catch (error) {
            this.store.modelApiKey.delete(row.id)
            throw error
        }
        return this.listApiKeys().find((item) => item.id === row.id) as ModelApiKey
    }

    async updateApiKey(id: string, input: ModelApiKeyInput): Promise<ModelApiKey | null> {
        const current = this.store.modelApiKey.get(id)
        if (!current) return null
        const changingKind =
            current.provider !== input.provider || current.credentialType !== input.credentialType
        const hasReplacement = hasCredentialInput(input)
        if (changingKind && !hasReplacement) {
            throw new ProviderConfigurationError(
                'Provider 또는 인증 방식을 바꾸려면 새 인증 정보를 입력해 주세요.',
            )
        }
        const bundle = await this.readCredentialBundle()
        if (hasReplacement) bundle.credentials[id] = credentialSecret(input)
        if (!bundle.credentials[id]) {
            throw new ProviderConfigurationError('저장된 인증 정보를 찾을 수 없습니다.')
        }
        await this.vault.set(JSON.stringify(bundle))
        const row = this.store.modelApiKey.update(id, {
            name: input.name,
            provider: input.provider,
            credentialType: input.credentialType,
            hint: hasReplacement ? credentialHint(input) : current.hint,
        })
        return row ? (this.listApiKeys().find((item) => item.id === id) ?? null) : null
    }

    async deleteApiKey(id: string) {
        const bundle = await this.readCredentialBundle()
        const result = this.store.modelApiKey.delete(id)
        if (result !== 'deleted') return result
        delete bundle.credentials[id]
        if (Object.keys(bundle.credentials).length) await this.vault.set(JSON.stringify(bundle))
        else this.vault.clear()
        return result
    }

    async update(input: ProviderSettingsInput): Promise<ProviderSettings> {
        const current = this.store.provider.get()
        let credentialType =
            input.credentialType ??
            (current?.provider === input.provider ? current.credentialType : undefined) ??
            (input.provider === 'vertex' ? 'adc' : 'none')
        let projectId = input.provider === 'vertex' ? input.projectId : undefined
        if (input.clearCredentials || input.clearApiKey) {
            this.vault.clear()
            credentialType = input.provider === 'vertex' ? 'adc' : 'none'
        }
        if (input.provider === 'vertex') {
            const currentCredentialType =
                current?.provider === 'vertex'
                    ? (current.credentialType ?? (this.vault.hasSecret() ? 'apiKey' : 'adc'))
                    : 'adc'
            const replacesCredential = Boolean(input.serviceAccountJson || input.apiKey)
            const clearsCredential = input.clearCredentials || input.clearApiKey
            if (clearsCredential) {
                credentialType = 'adc'
            } else if (input.serviceAccountJson) {
                const serviceAccount = parseServiceAccount(input.serviceAccountJson)
                await this.vault.set(
                    JSON.stringify({
                        version: 2,
                        type: 'serviceAccount',
                        provider: 'vertex',
                        serviceAccount,
                    }),
                )
                credentialType = 'serviceAccount'
                projectId ||= serviceAccount.project_id
            } else if (input.apiKey) {
                await this.vault.set(
                    JSON.stringify({
                        version: 2,
                        type: 'apiKey',
                        provider: 'vertex',
                        apiKey: input.apiKey,
                    }),
                )
                credentialType = 'apiKey'
            }
            if (
                !replacesCredential &&
                !clearsCredential &&
                credentialType !== undefined &&
                credentialType !== currentCredentialType
            ) {
                throw new ProviderConfigurationError(
                    credentialType === 'serviceAccount'
                        ? '서비스 계정 JSON 파일을 먼저 선택해 주세요.'
                        : 'Vertex API 키를 먼저 입력해 주세요.',
                )
            }
        } else if (input.provider === 'aws' && input.awsSecretAccessKey) {
            await this.vault.set(
                JSON.stringify({
                    version: 2,
                    type: 'aws',
                    provider: 'aws',
                    secretAccessKey: input.awsSecretAccessKey,
                    sessionToken: input.awsSessionToken || undefined,
                }),
            )
            credentialType = 'aws'
        } else if (input.apiKey) {
            await this.vault.set(
                JSON.stringify({
                    version: 2,
                    type: 'apiKey',
                    provider: input.provider,
                    apiKey: input.apiKey,
                }),
            )
            credentialType = 'apiKey'
        }

        const config = providerConfig(input, credentialType, projectId)
        const runtime = await this.resolveConfig(config)
        providerFor(runtime).validateConfig(runtime)
        this.store.provider.set(config)
        const migratedPreset = this.store.modelPreset.get('00000000-0000-4000-8000-000000000002')
        if (migratedPreset) {
            const legacyKey = this.store.modelApiKey.get(LEGACY_CREDENTIAL_ID)
            const usesStoredCredential = ['apiKey', 'serviceAccount', 'aws'].includes(
                credentialType ?? '',
            )
            if (legacyKey && usesStoredCredential) {
                this.store.modelApiKey.update(LEGACY_CREDENTIAL_ID, {
                    name: legacyKey.name,
                    provider: config.provider,
                    credentialType: credentialType as 'apiKey' | 'serviceAccount' | 'aws',
                    hint: legacyKey.hint,
                })
            }
            this.store.modelPreset.update(migratedPreset.id, {
                name: migratedPreset.name,
                config,
                apiKeyId: legacyKey && usesStoredCredential ? legacyKey.id : null,
            })
        }
        return this.get() as ProviderSettings
    }

    async requireRuntime(): Promise<RuntimeProviderConfig> {
        const config = this.store.provider.get()
        if (!config) throw new ProviderConfigurationError('No provider is configured')
        return this.resolveConfig(config)
    }

    async requireRuntimeForConversation(
        conversationId: string,
        auxiliary = false,
    ): Promise<RuntimeProviderConfig> {
        const conversation = this.store.conversation.get(conversationId)
        if (!conversation) throw new ProviderConfigurationError('Conversation not found')
        const settings = this.store.settings.get()
        const mainId = conversation.modelPresetId ?? settings.defaultModelPresetId
        const presetId = auxiliary
            ? (conversation.auxiliaryModelPresetId ??
              settings.defaultAuxiliaryModelPresetId ??
              mainId)
            : mainId
        if (!presetId) {
            const legacy = await this.requireRuntime()
            return auxiliary && legacy.auxiliaryModelId
                ? { ...legacy, modelId: legacy.auxiliaryModelId }
                : legacy
        }
        const preset = this.store.modelPreset.get(presetId)
        if (!preset) throw new ProviderConfigurationError('Bound model preset does not exist')
        return this.resolvePreset(preset)
    }

    async requireRuntimeForModelPreset(id: string): Promise<RuntimeProviderConfig> {
        const preset = this.store.modelPreset.get(id)
        if (!preset) throw new ProviderConfigurationError('Model preset does not exist')
        return this.resolvePreset(preset)
    }

    configForConversation(conversationId: string): ProviderConfig | null {
        const conversation = this.store.conversation.get(conversationId)
        if (!conversation) return null
        const settings = this.store.settings.get()
        const presetId = conversation.modelPresetId ?? settings.defaultModelPresetId
        return presetId
            ? (this.store.modelPreset.get(presetId)?.config ?? null)
            : this.store.provider.get()
    }

    async testModelPreset(id: string): Promise<{ ok: boolean; message: string }> {
        const preset = this.store.modelPreset.get(id)
        if (!preset) throw new ProviderConfigurationError('Model preset not found')
        const runtime = await this.resolvePreset(preset)
        return providerFor(runtime).healthCheck(runtime)
    }

    async listModelsForPreset(id: string) {
        const preset = this.store.modelPreset.get(id)
        if (!preset) throw new ProviderConfigurationError('Model preset not found')
        const runtime = await this.resolvePreset(preset)
        return providerFor(runtime).listModels(runtime)
    }

    async listModelsForInput(input: ModelDiscoveryInput) {
        const runtime = await this.resolvePresetConfig(input.config, input.apiKeyId)
        return providerFor(runtime).listModels(runtime)
    }

    private async resolveConfig(config: ProviderConfig): Promise<RuntimeProviderConfig> {
        const secret = await this.vault.get()
        if (!secret) return config
        const parsed = parseProviderSecret(secret)
        if (!parsed.provider && config.provider !== 'vertex') return config
        if (parsed.provider && parsed.provider !== config.provider) return config
        if (parsed.type === 'serviceAccount') {
            return { ...config, serviceAccount: parsed.serviceAccount }
        }
        if (parsed.type === 'aws') {
            return {
                ...config,
                awsSecretAccessKey: parsed.secretAccessKey,
                awsSessionToken: parsed.sessionToken,
            }
        }
        return { ...config, apiKey: parsed.apiKey }
    }

    private validatePresetCredential(input: ModelPresetInput): void {
        if (!input.apiKeyId) return
        const key = this.store.modelApiKey.get(input.apiKeyId)
        if (!key) throw new ProviderConfigurationError('API key does not exist')
        if (key.provider !== input.config.provider) {
            throw new ProviderConfigurationError('모델 프리셋과 API 키의 provider가 다릅니다.')
        }
    }

    private async resolvePreset(preset: ModelPreset): Promise<RuntimeProviderConfig> {
        return this.resolvePresetConfig(preset.config, preset.apiKeyId)
    }

    private async resolvePresetConfig(
        config: ProviderConfig,
        apiKeyId: string | null,
    ): Promise<RuntimeProviderConfig> {
        if (!apiKeyId) return config
        const key = this.store.modelApiKey.get(apiKeyId)
        if (!key) throw new ProviderConfigurationError('Bound API key does not exist')
        const bundle = await this.readCredentialBundle()
        const secret = bundle.credentials[apiKeyId]
        if (!secret) throw new ProviderConfigurationError('Bound API key is not configured')
        if (secret.provider && secret.provider !== config.provider) {
            throw new ProviderConfigurationError('Bound API key belongs to another provider')
        }
        if (secret.type === 'serviceAccount') {
            return {
                ...config,
                credentialType: 'serviceAccount',
                serviceAccount: secret.serviceAccount,
            }
        }
        if (secret.type === 'aws') {
            return {
                ...config,
                credentialType: 'aws',
                accessKeyId:
                    secret.accessKeyId ??
                    (config.provider === 'aws' ? config.accessKeyId : undefined),
                awsSecretAccessKey: secret.secretAccessKey,
                awsSessionToken: secret.sessionToken,
            } as RuntimeProviderConfig
        }
        return { ...config, credentialType: 'apiKey', apiKey: secret.apiKey }
    }

    private async readCredentialBundle(): Promise<CredentialBundle> {
        const value = await this.vault.get()
        if (!value) return { version: 3, credentials: {} }
        try {
            const decoded = CredentialBundleSchema.safeParse(JSON.parse(value))
            if (decoded.success) return decoded.data
        } catch {}
        const legacy = parseProviderSecret(value)
        return { version: 3, credentials: { [LEGACY_CREDENTIAL_ID]: legacy } }
    }
}

function hasCredentialInput(input: ModelApiKeyInput): boolean {
    if (input.credentialType === 'apiKey') return Boolean(input.apiKey)
    if (input.credentialType === 'serviceAccount') return Boolean(input.serviceAccountJson)
    return Boolean(input.accessKeyId && input.awsSecretAccessKey)
}

function credentialSecret(input: ModelApiKeyInput): z.infer<typeof ProviderSecretSchema> {
    if (input.credentialType === 'apiKey') {
        if (!input.apiKey) throw new ProviderConfigurationError('API key is required')
        return { version: 2, type: 'apiKey', provider: input.provider, apiKey: input.apiKey }
    }
    if (input.credentialType === 'serviceAccount') {
        if (!input.serviceAccountJson) {
            throw new ProviderConfigurationError('서비스 계정 JSON이 필요합니다.')
        }
        return {
            version: 2,
            type: 'serviceAccount',
            provider: input.provider,
            serviceAccount: parseServiceAccount(input.serviceAccountJson) as z.infer<
                typeof ServiceAccountSchema
            >,
        }
    }
    if (!input.accessKeyId || !input.awsSecretAccessKey) {
        throw new ProviderConfigurationError('AWS access key ID와 secret access key가 필요합니다.')
    }
    return {
        version: 2,
        type: 'aws',
        provider: 'aws',
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.awsSecretAccessKey,
        sessionToken: input.awsSessionToken || undefined,
    }
}

function credentialHint(input: ModelApiKeyInput): string {
    if (input.credentialType === 'serviceAccount' && input.serviceAccountJson) {
        return parseServiceAccount(input.serviceAccountJson).client_email
    }
    const value = input.credentialType === 'aws' ? (input.accessKeyId ?? '') : (input.apiKey ?? '')
    return value.length > 4 ? `••••${value.slice(-4)}` : '저장됨'
}

function providerConfig(
    input: ProviderSettingsInput,
    credentialType?: ProviderConfig['credentialType'],
    projectId?: string,
): ProviderConfig {
    const config = ProviderConfigSchema.parse(input)
    return {
        ...config,
        ...(config.provider === 'vertex' ? { projectId: projectId ?? config.projectId } : {}),
        credentialType,
    } as ProviderConfig
}

function parseServiceAccount(value: string): ServiceAccountCredentials {
    try {
        return ServiceAccountSchema.parse(JSON.parse(value)) as ServiceAccountCredentials
    } catch {
        throw new ProviderConfigurationError(
            '서비스 계정 JSON에 project_id, client_email, private_key가 필요합니다.',
        )
    }
}

function parseProviderSecret(value: string) {
    try {
        const decoded = ProviderSecretSchema.safeParse(JSON.parse(value))
        if (decoded.success) return decoded.data
    } catch {
        // Legacy rows store the API key as a raw encrypted string.
    }
    return { version: 1 as const, type: 'apiKey' as const, apiKey: value }
}

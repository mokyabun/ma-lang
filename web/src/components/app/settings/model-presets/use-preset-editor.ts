import { POCKET_RISU_PROFILE_OPTION } from '@malang/shared'
import type {
    ModelApiKey,
    ModelApiKeyInput,
    ModelPreset,
    ModelPresetInput,
    PocketRisuProfileBinding,
    ProviderConfig,
    ProviderKind,
    TokenizerId,
} from '@malang/shared'
import { useState } from 'react'

import { api } from '@/lib/api'

import type { Notice } from '../shared/notice-box'
import {
    nativeProfileFieldKeys,
    generationParameterKeys,
    readProfileBinding,
    runtimeProviderOptions,
    profileGenerationDefaults,
    finiteNumber,
    uniqueModels,
} from './model'
import { PROVIDERS, MODEL_HINTS } from './provider-catalog'

export type PresetEditorProps = {
    preset: ModelPreset | null
    apiKeys: ModelApiKey[]
    isDefault: boolean
    onSaved: (id: string) => Promise<void>
    onDeleted: () => Promise<void>
    onMakeDefault: (id: string) => Promise<void>
}

export function usePresetEditor({ preset, apiKeys, onSaved }: PresetEditorProps) {
    const importedProfile = readProfileBinding(preset)
    const initialKind = preset?.config.provider ?? 'openai'
    const initialMeta = PROVIDERS.find((item) => item.id === initialKind) ?? PROVIDERS[0]!
    const importedModelField = importedProfile?.envelope.profile.schema.find(
        (field) => field.key === 'modelId',
    )
    const initialHints = [
        importedProfile?.envelope.profile.modelId,
        ...(importedModelField?.enum?.map((option) => String(option.value)) ?? []),
        ...(MODEL_HINTS[initialKind] ?? [initialMeta.model]),
    ].filter((value): value is string => Boolean(value))
    const [name, setName] = useState(preset?.name ?? '')
    const [provider, setProvider] = useState<ProviderKind>(initialKind)
    const [modelId, setModelId] = useState(preset?.config.modelId ?? initialMeta.model)
    const [modelMode, setModelMode] = useState<'select' | 'custom'>(
        initialHints.includes(preset?.config.modelId ?? initialMeta.model) ? 'select' : 'custom',
    )
    const [discoveredModels, setDiscoveredModels] = useState<Array<{ id: string; name: string }>>(
        [],
    )
    const [discovering, setDiscovering] = useState(false)
    const [baseUrl, setBaseUrl] = useState(preset?.config.baseUrl ?? initialMeta.baseUrl ?? '')
    const [apiKeyId, setApiKeyId] = useState(preset?.apiKeyId ?? '')
    const [credentialMode, setCredentialMode] = useState<'saved' | 'direct'>(
        preset?.apiKeyId || apiKeys.some((item) => item.provider === initialKind)
            ? 'saved'
            : 'direct',
    )
    const [directCredentialType, setDirectCredentialType] = useState<
        ModelApiKeyInput['credentialType']
    >(
        initialKind === 'aws'
            ? 'aws'
            : preset?.config.credentialType === 'serviceAccount'
              ? 'serviceAccount'
              : 'apiKey',
    )
    const [directSecret, setDirectSecret] = useState('')
    const [directAccessKeyId, setDirectAccessKeyId] = useState('')
    const [directSessionToken, setDirectSessionToken] = useState('')
    const [temperature, setTemperature] = useState(
        String(preset ? (preset.config.defaults.temperature ?? '') : 0.8),
    )
    const [maxTokens, setMaxTokens] = useState(
        String(preset ? (preset.config.defaults.maxOutputTokens ?? '') : 2048),
    )
    const [projectId, setProjectId] = useState(
        preset?.config.provider === 'vertex' ? preset.config.projectId : '',
    )
    const [location, setLocation] = useState(
        preset?.config.provider === 'vertex' ? preset.config.location : 'global',
    )
    const [region, setRegion] = useState(
        preset?.config.provider === 'aws' ? preset.config.region : 'us-east-1',
    )
    const [profileBinding, setProfileBinding] = useState<PocketRisuProfileBinding | null>(
        importedProfile,
    )
    const [profileValues, setProfileValues] = useState<Record<string, unknown>>(
        importedProfile?.values ?? {},
    )
    const [options, setOptions] = useState(
        JSON.stringify(runtimeProviderOptions(preset?.config.providerOptions), null, 2),
    )
    const [tokenizer, setTokenizer] = useState<TokenizerId | ''>(preset?.config.tokenizer ?? '')
    const [notice, setNotice] = useState<Notice>(null)
    const meta = PROVIDERS.find((item) => item.id === provider) ?? initialMeta
    const keys = apiKeys.filter((item) => item.provider === provider)
    const hintModels = MODEL_HINTS[provider] ?? [meta.model]
    const profileModelHints =
        profileBinding?.envelope.profile.schema
            .find((field) => field.key === 'modelId')
            ?.enum?.map((item) => ({ id: String(item.value), name: item.label })) ?? []
    const selectableModels = uniqueModels([
        ...profileModelHints,
        ...hintModels.map((id) => ({ id, name: id })),
        ...discoveredModels,
    ])
    function selectProvider(kind: ProviderKind) {
        const next = PROVIDERS.find((item) => item.id === kind)!
        setProvider(kind)
        setModelId(next.model)
        setModelMode('select')
        setDiscoveredModels([])
        setBaseUrl(next.baseUrl ?? '')
        setApiKeyId('')
        const nextKeys = apiKeys.filter((item) => item.provider === kind)
        setCredentialMode(nextKeys.length ? 'saved' : 'direct')
        setDirectCredentialType(kind === 'aws' ? 'aws' : 'apiKey')
        setDirectSecret('')
        setDirectAccessKeyId('')
        setDirectSessionToken('')
        setProfileBinding(null)
        setProfileValues({})
    }
    function buildConfig(): ProviderConfig {
        let providerOptions: Record<string, unknown>
        try {
            providerOptions = JSON.parse(options || '{}') as Record<string, unknown>
        } catch {
            throw new Error('Provider options가 올바른 JSON이 아닙니다.')
        }
        const nextProfileValues: Record<string, unknown> | null = profileBinding
            ? {
                  ...profileValues,
                  modelId: modelId.trim(),
                  temperature: finiteNumber(temperature),
                  maxOutputTokens: finiteNumber(maxTokens),
                  endpointUrl: baseUrl,
                  ...(provider === 'vertex' ? { projectId, location } : {}),
                  ...(provider === 'aws' ? { region } : {}),
              }
            : null
        if (profileBinding && nextProfileValues) {
            for (const field of profileBinding.envelope.profile.schema) {
                if (
                    field.secret ||
                    field.mapsTo?.target === 'auth' ||
                    generationParameterKeys.has(field.key) ||
                    nativeProfileFieldKeys.has(field.key)
                ) {
                    continue
                }
                if (nextProfileValues[field.key] !== undefined) {
                    providerOptions[field.key] = nextProfileValues[field.key]
                }
            }
            providerOptions[POCKET_RISU_PROFILE_OPTION] = {
                ...profileBinding,
                values: nextProfileValues,
            }
        }
        const defaults = profileBinding
            ? profileGenerationDefaults(nextProfileValues ?? {})
            : {
                  temperature: finiteNumber(temperature),
                  maxOutputTokens: finiteNumber(maxTokens),
              }
        const common = {
            provider,
            modelId: modelId.trim(),
            baseUrl: baseUrl || undefined,
            defaults,
            providerOptions,
            tokenizer: tokenizer || undefined,
        }
        let config: ProviderConfig
        if (provider === 'vertex') config = { ...common, provider, projectId, location }
        else if (provider === 'aws') config = { ...common, provider, region }
        else config = common as ProviderConfig
        return config
    }
    function directCredentialInput(): ModelApiKeyInput {
        const keyName = `${name.trim() || meta.label} · 직접 입력`
        if (directCredentialType === 'serviceAccount') {
            if (!directSecret.trim()) throw new Error('Service Account JSON을 입력해 주세요.')
            return {
                name: keyName,
                provider,
                credentialType: 'serviceAccount',
                serviceAccountJson: directSecret,
            }
        }
        if (directCredentialType === 'aws') {
            if (!directAccessKeyId.trim() || !directSecret.trim()) {
                throw new Error('AWS access key ID와 secret access key를 입력해 주세요.')
            }
            return {
                name: keyName,
                provider,
                credentialType: 'aws',
                accessKeyId: directAccessKeyId,
                awsSecretAccessKey: directSecret,
                awsSessionToken: directSessionToken || undefined,
            }
        }
        if (!directSecret.trim()) throw new Error('API 키를 입력해 주세요.')
        return {
            name: keyName,
            provider,
            credentialType: 'apiKey',
            apiKey: directSecret,
        }
    }
    async function discoverModels() {
        setDiscovering(true)
        setNotice(null)
        try {
            if (credentialMode === 'direct' && !['none', 'unsupported'].includes(meta.auth)) {
                throw new Error(
                    '직접 입력 인증 정보는 프리셋을 저장한 뒤 Provider 모델을 동기화할 수 있습니다.',
                )
            }
            const result = await api.discoverModels({
                config: buildConfig(),
                apiKeyId: apiKeyId || null,
            })
            setDiscoveredModels(result.models)
            if (!result.models.length) {
                setNotice({
                    tone: 'success',
                    text: 'Provider가 추가 모델 목록을 반환하지 않았습니다.',
                })
            }
        } catch (cause) {
            setNotice({
                tone: 'error',
                text: cause instanceof Error ? cause.message : '모델 목록을 불러오지 못했습니다.',
            })
        } finally {
            setDiscovering(false)
        }
    }
    async function save() {
        try {
            const config = buildConfig()
            if (!name.trim() || !config.modelId) throw new Error('이름과 Model ID를 입력해 주세요.')
            let boundApiKeyId = apiKeyId || null
            if (credentialMode === 'direct' && !['none', 'unsupported'].includes(meta.auth)) {
                const createdKey = await api.createModelApiKey(directCredentialInput())
                boundApiKeyId = createdKey.id
            }
            const input: ModelPresetInput = {
                name: name.trim(),
                config,
                apiKeyId: boundApiKeyId,
            }
            const saved = preset
                ? await api.updateModelPreset(preset.id, input)
                : await api.createModelPreset(input)
            setNotice({ tone: 'success', text: '모델 프리셋을 저장했습니다.' })
            await onSaved(saved.id)
        } catch (cause) {
            setNotice({
                tone: 'error',
                text: cause instanceof Error ? cause.message : '저장하지 못했습니다.',
            })
        }
    }
    return {
        name,
        setName,
        provider,
        modelId,
        setModelId,
        modelMode,
        setModelMode,
        discovering,
        baseUrl,
        setBaseUrl,
        apiKeyId,
        setApiKeyId,
        credentialMode,
        setCredentialMode,
        directCredentialType,
        setDirectCredentialType,
        directSecret,
        setDirectSecret,
        directAccessKeyId,
        setDirectAccessKeyId,
        directSessionToken,
        setDirectSessionToken,
        temperature,
        setTemperature,
        maxTokens,
        setMaxTokens,
        projectId,
        setProjectId,
        location,
        setLocation,
        region,
        setRegion,
        profileBinding,
        profileValues,
        setProfileValues,
        options,
        setOptions,
        tokenizer,
        setTokenizer,
        notice,
        setNotice,
        meta,
        keys,
        selectableModels,
        selectProvider,
        discoverModels,
        save,
    }
}

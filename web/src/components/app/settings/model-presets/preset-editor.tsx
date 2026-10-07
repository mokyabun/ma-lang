import type { ProviderKind, TokenizerId } from '@malang/shared'
import {
    CloudCheck,
    DownloadSimple,
    PlugsConnected,
    Trash,
    WarningCircle,
} from '@phosphor-icons/react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, modelPresetExportUrl } from '@/lib/api'

import { Field } from '../shared/field'
import { NoticeBox } from '../shared/notice-box'
import { SettingsGroup } from '../shared/settings-group'
import { CredentialChooser } from './credential-chooser'
import { ModelIdPicker } from './model-id-picker'
import { SchemaDefinedSettings } from './profile-settings'
import { PROVIDERS, TOKENIZERS } from './provider-catalog'
import { usePresetEditor, type PresetEditorProps } from './use-preset-editor'

export function PresetEditor({
    preset,
    apiKeys,
    isDefault,
    onSaved,
    onDeleted,
    onMakeDefault,
}: PresetEditorProps) {
    const {
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
    } = usePresetEditor({ preset, apiKeys, isDefault, onSaved, onDeleted, onMakeDefault })
    return (
        <div className="grid gap-5 p-5 sm:p-6">
            <Field label="프리셋 이름">
                <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="예: Gemini 2.5 Flash"
                />
            </Field>
            <Field label="Provider">
                <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={provider}
                    onChange={(event) => selectProvider(event.target.value as ProviderKind)}
                >
                    {PROVIDERS.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.label}
                        </option>
                    ))}
                </select>
            </Field>
            <ModelIdPicker
                mode={modelMode}
                modelId={modelId}
                models={selectableModels}
                discovering={discovering}
                onModeChange={setModelMode}
                onChange={setModelId}
                onDiscover={() => void discoverModels()}
            />
            {meta.auth === 'unsupported' ? (
                <Alert variant="destructive">
                    <WarningCircle />
                    <AlertDescription>
                        브라우저 전용 provider라 서버에서 실행할 수 없습니다.
                    </AlertDescription>
                </Alert>
            ) : null}
            {meta.baseUrl !== undefined ||
            ['openai-compatible', 'mancer'].includes(provider) ||
            profileBinding?.envelope.profile.schema.some((field) => field.key === 'endpointUrl') ? (
                <Field label="API base URL">
                    <Input
                        type="url"
                        value={baseUrl}
                        onChange={(event) => setBaseUrl(event.target.value)}
                    />
                </Field>
            ) : null}
            {provider === 'vertex' ? (
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Project ID">
                        <Input
                            value={projectId}
                            onChange={(event) => setProjectId(event.target.value)}
                        />
                    </Field>
                    <Field label="Location">
                        <Input
                            value={location}
                            onChange={(event) => setLocation(event.target.value)}
                        />
                    </Field>
                </div>
            ) : null}
            {provider === 'aws' ? (
                <Field label="AWS region">
                    <Input value={region} onChange={(event) => setRegion(event.target.value)} />
                </Field>
            ) : null}
            {!['none', 'unsupported'].includes(meta.auth) ? (
                <CredentialChooser
                    provider={provider}
                    providerLabel={meta.label}
                    mode={credentialMode}
                    keys={keys}
                    apiKeyId={apiKeyId}
                    directType={directCredentialType}
                    directSecret={directSecret}
                    accessKeyId={directAccessKeyId}
                    sessionToken={directSessionToken}
                    onModeChange={setCredentialMode}
                    onApiKeyChange={setApiKeyId}
                    onDirectTypeChange={setDirectCredentialType}
                    onDirectSecretChange={setDirectSecret}
                    onAccessKeyIdChange={setDirectAccessKeyId}
                    onSessionTokenChange={setDirectSessionToken}
                />
            ) : null}
            <div className="grid gap-3">
                <p className="font-mono text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
                    생성
                </p>
                <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    <Field label="Temperature">
                        <Input
                            type="number"
                            min="0"
                            max="2"
                            step="0.1"
                            value={temperature}
                            onChange={(event) => setTemperature(event.target.value)}
                        />
                    </Field>
                    <Field label="최대 출력 토큰">
                        <Input
                            type="number"
                            min="1"
                            value={maxTokens}
                            onChange={(event) => setMaxTokens(event.target.value)}
                        />
                    </Field>
                </div>
                <Field
                    label="토크나이저"
                    description="문맥 자르기, 로어북 예산, 장기 기억의 토큰 계산에 씁니다."
                >
                    <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={tokenizer}
                        onChange={(event) => setTokenizer(event.target.value as TokenizerId | '')}
                    >
                        <option value="">
                            자동
                            {profileBinding?.envelope.profile.recommendedTokenizer
                                ? ` (${profileBinding.envelope.profile.recommendedTokenizer})`
                                : ''}
                        </option>
                        {TOKENIZERS.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>
            {profileBinding ? (
                <SchemaDefinedSettings
                    binding={profileBinding}
                    values={profileValues}
                    onChange={(key, value) =>
                        setProfileValues((current) => ({ ...current, [key]: value }))
                    }
                />
            ) : (
                <SettingsGroup title="Provider 고급 옵션" meta="JSON">
                    <Field label="Provider options JSON">
                        <Textarea
                            className="min-h-24 font-mono text-xs"
                            value={options}
                            onChange={(event) => setOptions(event.target.value)}
                        />
                    </Field>
                </SettingsGroup>
            )}
            <NoticeBox notice={notice} />
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button type="button" onClick={save} disabled={meta.auth === 'unsupported'}>
                    프리셋 저장
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    disabled={!preset}
                    onClick={async () => {
                        if (!preset) return
                        try {
                            const result = await api.testModelPreset(preset.id)
                            setNotice({ tone: 'success', text: result.message })
                        } catch (cause) {
                            setNotice({
                                tone: 'error',
                                text:
                                    cause instanceof Error ? cause.message : '연결하지 못했습니다.',
                            })
                        }
                    }}
                >
                    <PlugsConnected /> 연결 확인
                </Button>
                {preset ? (
                    <a
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
                        href={modelPresetExportUrl(preset.id)}
                        download
                    >
                        <DownloadSimple /> 프로필 내보내기
                    </a>
                ) : null}
                {preset && !isDefault ? (
                    <Button
                        type="button"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => onMakeDefault(preset.id)}
                    >
                        <CloudCheck /> 기본 모델로 지정
                    </Button>
                ) : null}
                {isDefault ? (
                    <span className="ml-auto text-xs text-primary">현재 기본 모델</span>
                ) : null}
                {preset ? (
                    <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={async () => {
                            try {
                                await api.deleteModelPreset(preset.id)
                                await onDeleted()
                            } catch (cause) {
                                setNotice({
                                    tone: 'error',
                                    text:
                                        cause instanceof Error
                                            ? cause.message
                                            : '삭제하지 못했습니다.',
                                })
                            }
                        }}
                    >
                        <Trash /> 삭제
                    </Button>
                ) : null}
            </div>
        </div>
    )
}

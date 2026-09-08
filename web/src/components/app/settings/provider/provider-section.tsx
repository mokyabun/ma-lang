import type { ProviderApiFormat, ProviderKind } from '@malang/shared'
import {
    CheckCircle,
    CloudCheck,
    PlugsConnected,
    UploadSimple,
    WarningCircle,
} from '@phosphor-icons/react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { SectionHeading } from '../../page-heading'
import { providers } from './provider-catalog'
import { Field } from './provider-field'
import { useProviderSettings, type ProviderSectionProps } from './use-provider-settings'

export function ProviderSection({ provider, onSaved }: ProviderSectionProps) {
    const {
        providerKind,
        baseUrl,
        setBaseUrl,
        modelId,
        setModelId,
        auxiliaryModelId,
        setAuxiliaryModelId,
        apiFormat,
        setApiFormat,
        apiKey,
        setApiKey,
        projectId,
        setProjectId,
        location,
        setLocation,
        credentialType,
        setCredentialType,
        serviceAccountFile,
        region,
        setRegion,
        accessKeyId,
        setAccessKeyId,
        awsSecretAccessKey,
        setAwsSecretAccessKey,
        awsSessionToken,
        setAwsSessionToken,
        clearCredentials,
        setClearCredentials,
        providerOptions,
        setProviderOptions,
        temperature,
        setTemperature,
        maxOutputTokens,
        setMaxOutputTokens,
        providerTab,
        setProviderTab,
        message,
        selected,
        autoSave,
        chooseProvider,
        handleServiceAccount,
        handleTest,
    } = useProviderSettings({ provider, onSaved })
    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <div className="w-full">
                <SectionHeading className="mb-6 pr-12 [&_h2]:text-2xl" title="모델 연결" />
                <div className="flex flex-col gap-6" onBlurCapture={() => void autoSave.flush()}>
                    <Tabs
                        value={providerTab}
                        onValueChange={(value) => setProviderTab(value as typeof providerTab)}
                    >
                        <TabsList variant="line">
                            <TabsTrigger value="connection">연결</TabsTrigger>
                            <TabsTrigger value="parameters">파라미터</TabsTrigger>
                            <TabsTrigger value="advanced">고급</TabsTrigger>
                        </TabsList>
                        <TabsContent value="connection" className="flex flex-col gap-4">
                            <Label className="grid gap-2 text-xs text-muted-foreground">
                                Provider
                                <select
                                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                    value={providerKind}
                                    onChange={(event) =>
                                        chooseProvider(event.target.value as ProviderKind)
                                    }
                                >
                                    {providers.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </Label>
                            <p className="text-[10px] leading-5 text-muted-foreground">
                                {selected.description}
                            </p>
                            {selected.auth === 'unsupported' ? (
                                <Alert variant="destructive">
                                    <WarningCircle />
                                    <AlertDescription>
                                        이 provider는 브라우저 런타임에 종속되어 서버에서 직접
                                        실행할 수 없습니다. 동일 모델의
                                        Ollama/Ooba/OpenAI-compatible endpoint를 선택하세요.
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                            {selected.baseUrl !== undefined ||
                            ['openai-compatible', 'ooba', 'mancer', 'kobold', 'ollama'].includes(
                                providerKind,
                            ) ? (
                                <Field label="API base URL">
                                    <Input
                                        type="url"
                                        value={baseUrl}
                                        onChange={(event) => setBaseUrl(event.target.value)}
                                    />
                                </Field>
                            ) : null}
                            {selected.formats ? (
                                <Label className="grid gap-2 text-xs text-muted-foreground">
                                    API format
                                    <select
                                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                        value={apiFormat}
                                        onChange={(event) =>
                                            setApiFormat(event.target.value as ProviderApiFormat)
                                        }
                                    >
                                        {selected.formats.map((format) => (
                                            <option key={format}>{format}</option>
                                        ))}
                                    </select>
                                </Label>
                            ) : null}
                            {selected.auth === 'key' || selected.auth === 'optionalKey' ? (
                                <Field
                                    label={`API key${selected.auth === 'optionalKey' ? ' (선택)' : ''}`}
                                >
                                    <Input
                                        type="password"
                                        autoComplete="new-password"
                                        value={apiKey}
                                        onChange={(event) => {
                                            setApiKey(event.target.value)
                                            setClearCredentials(false)
                                        }}
                                        placeholder={
                                            provider?.apiKeyConfigured
                                                ? '저장된 키 유지 (교체할 때만 입력)'
                                                : ''
                                        }
                                    />
                                </Field>
                            ) : null}
                            {selected.auth === 'vertex' ? (
                                <>
                                    <Label className="grid gap-2 text-xs text-muted-foreground">
                                        인증 방식
                                        <select
                                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                            value={credentialType}
                                            onChange={(event) =>
                                                setCredentialType(
                                                    event.target.value as typeof credentialType,
                                                )
                                            }
                                        >
                                            <option value="apiKey">API key</option>
                                            <option value="serviceAccount">서비스 계정 JSON</option>
                                            <option value="adc">ADC</option>
                                        </select>
                                    </Label>
                                    {credentialType === 'apiKey' ? (
                                        <Field label="Vertex API key">
                                            <Input
                                                type="password"
                                                value={apiKey}
                                                onChange={(event) => setApiKey(event.target.value)}
                                            />
                                        </Field>
                                    ) : null}
                                    {credentialType === 'serviceAccount' ? (
                                        <Label className="relative grid gap-2 text-xs text-muted-foreground [&>input]:sr-only">
                                            <span className="flex min-h-12 items-center gap-2 border border-dashed p-3">
                                                <UploadSimple />
                                                {serviceAccountFile || '서비스 계정 JSON 선택'}
                                            </span>
                                            <Input
                                                type="file"
                                                accept=".json,application/json"
                                                onChange={(event) =>
                                                    void handleServiceAccount(event)
                                                }
                                            />
                                        </Label>
                                    ) : null}
                                    <div className="grid grid-cols-2 gap-2">
                                        <Field label="Project ID">
                                            <Input
                                                value={projectId}
                                                onChange={(event) =>
                                                    setProjectId(event.target.value)
                                                }
                                            />
                                        </Field>
                                        <Field label="Location">
                                            <Input
                                                value={location}
                                                onChange={(event) =>
                                                    setLocation(event.target.value)
                                                }
                                            />
                                        </Field>
                                    </div>
                                </>
                            ) : null}
                            {selected.auth === 'aws' ? (
                                <>
                                    <Field label="AWS region">
                                        <Input
                                            value={region}
                                            onChange={(event) => setRegion(event.target.value)}
                                        />
                                    </Field>
                                    <Field label="Access key ID (비우면 서버 credential chain)">
                                        <Input
                                            value={accessKeyId}
                                            onChange={(event) => setAccessKeyId(event.target.value)}
                                        />
                                    </Field>
                                    <Field label="Secret access key">
                                        <Input
                                            type="password"
                                            value={awsSecretAccessKey}
                                            onChange={(event) =>
                                                setAwsSecretAccessKey(event.target.value)
                                            }
                                        />
                                    </Field>
                                    <Field label="Session token (선택)">
                                        <Input
                                            type="password"
                                            value={awsSessionToken}
                                            onChange={(event) =>
                                                setAwsSessionToken(event.target.value)
                                            }
                                        />
                                    </Field>
                                </>
                            ) : null}
                            <Field label="Model ID">
                                <Input
                                    value={modelId}
                                    onChange={(event) => setModelId(event.target.value)}
                                    required
                                />
                            </Field>
                            <Field label="Auxiliary model ID (axLLM)">
                                <Input
                                    value={auxiliaryModelId}
                                    onChange={(event) => setAuxiliaryModelId(event.target.value)}
                                    placeholder="비워 두면 주 모델 사용"
                                />
                            </Field>
                            {provider &&
                            (provider.apiKeyConfigured ||
                                provider.serviceAccountConfigured ||
                                provider.awsCredentialsConfigured) ? (
                                <Label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                        checked={clearCredentials}
                                        onCheckedChange={(checked) => setClearCredentials(checked)}
                                    />
                                    저장된 인증 정보 삭제
                                </Label>
                            ) : null}
                            <Button
                                size="lg"
                                variant="outline"
                                type="button"
                                disabled={selected.auth === 'unsupported'}
                                onClick={handleTest}
                            >
                                <PlugsConnected /> 연결 확인
                            </Button>
                        </TabsContent>
                        <TabsContent
                            value="parameters"
                            className="grid grid-cols-2 gap-3 max-sm:grid-cols-1"
                        >
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
                                    value={maxOutputTokens}
                                    onChange={(event) => setMaxOutputTokens(event.target.value)}
                                />
                            </Field>
                        </TabsContent>
                        <TabsContent value="advanced" className="flex flex-col gap-3">
                            <Label className="grid gap-2 text-xs text-muted-foreground">
                                Provider options JSON
                                <Textarea
                                    className="min-h-56 font-mono text-xs"
                                    value={providerOptions}
                                    onChange={(event) => setProviderOptions(event.target.value)}
                                />
                            </Label>
                            <p className="text-[10px] leading-5 text-muted-foreground">
                                OpenAI 계열은 <code>customBody</code>, NovelAI·NovelList는{' '}
                                <code>parameters</code>, Echo는 <code>message</code>와{' '}
                                <code>delayMs</code>를 사용할 수 있습니다.
                            </p>
                        </TabsContent>
                    </Tabs>
                    {message ? (
                        <Alert variant={message.tone === 'error' ? 'destructive' : 'default'}>
                            {message.tone === 'success' ? <CheckCircle /> : <WarningCircle />}
                            <AlertDescription>{message.text}</AlertDescription>
                        </Alert>
                    ) : null}
                    <footer className="flex items-center justify-between border-t border-border pt-5 text-[10px] text-muted-foreground">
                        {provider ? (
                            <span className="flex items-center gap-1">
                                <CloudCheck /> 현재 {provider.modelId}
                            </span>
                        ) : (
                            '아직 연결된 모델이 없습니다.'
                        )}
                        <span>인증 정보는 AES-256-GCM 암호화 저장</span>
                    </footer>
                </div>
            </div>
        </div>
    )
}

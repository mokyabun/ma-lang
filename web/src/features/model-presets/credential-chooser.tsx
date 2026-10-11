import type { ModelApiKey, ModelApiKeyInput, ProviderKind } from '@malang/shared'
import { Key } from '@phosphor-icons/react'

import { Field } from '@/components/form/field'
import { SegmentedChoice } from '@/components/form/segmented-choice'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function CredentialChooser({
    provider,
    providerLabel,
    mode,
    keys,
    apiKeyId,
    directType,
    directSecret,
    accessKeyId,
    sessionToken,
    onModeChange,
    onApiKeyChange,
    onDirectTypeChange,
    onDirectSecretChange,
    onAccessKeyIdChange,
    onSessionTokenChange,
}: {
    provider: ProviderKind
    providerLabel: string
    mode: 'saved' | 'direct'
    keys: ModelApiKey[]
    apiKeyId: string
    directType: ModelApiKeyInput['credentialType']
    directSecret: string
    accessKeyId: string
    sessionToken: string
    onModeChange: (mode: 'saved' | 'direct') => void
    onApiKeyChange: (id: string) => void
    onDirectTypeChange: (type: ModelApiKeyInput['credentialType']) => void
    onDirectSecretChange: (value: string) => void
    onAccessKeyIdChange: (value: string) => void
    onSessionTokenChange: (value: string) => void
}) {
    return (
        <fieldset className="grid gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <legend className="text-xs font-medium">인증 정보</legend>
                    <p className="mt-1 text-[10px] text-muted-foreground">{providerLabel}</p>
                </div>
                <SegmentedChoice
                    value={mode}
                    options={[
                        { value: 'saved', label: '저장된 키' },
                        { value: 'direct', label: '직접 입력' },
                    ]}
                    onChange={(next) => onModeChange(next as 'saved' | 'direct')}
                />
            </div>
            {mode === 'saved' ? (
                <Field label="사용할 API 키">
                    <select
                        className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                        value={apiKeyId}
                        onChange={(event) => onApiKeyChange(event.target.value)}
                    >
                        <option value="">선택하지 않음</option>
                        {keys.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name} · {item.hint}
                            </option>
                        ))}
                    </select>
                    {!keys.length ? (
                        <small>
                            {providerLabel}용 저장 키가 없습니다. 직접 입력을 선택해 주세요.
                        </small>
                    ) : null}
                </Field>
            ) : (
                <div className="grid gap-3">
                    {provider === 'vertex' ? (
                        <Field label="인증 방식">
                            <select
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                value={directType}
                                onChange={(event) =>
                                    onDirectTypeChange(
                                        event.target.value as ModelApiKeyInput['credentialType'],
                                    )
                                }
                            >
                                <option value="apiKey">API key</option>
                                <option value="serviceAccount">Service Account JSON</option>
                            </select>
                        </Field>
                    ) : null}
                    {directType === 'aws' ? (
                        <Field label="Access key ID">
                            <Input
                                value={accessKeyId}
                                onChange={(event) => onAccessKeyIdChange(event.target.value)}
                            />
                        </Field>
                    ) : null}
                    <Field
                        label={
                            directType === 'serviceAccount'
                                ? 'Service Account JSON'
                                : directType === 'aws'
                                  ? 'Secret access key'
                                  : 'API key'
                        }
                    >
                        {directType === 'serviceAccount' ? (
                            <Textarea
                                className="min-h-32 font-mono text-xs"
                                value={directSecret}
                                onChange={(event) => onDirectSecretChange(event.target.value)}
                                placeholder="Service Account 전체 JSON"
                            />
                        ) : (
                            <Input
                                type="password"
                                autoComplete="new-password"
                                value={directSecret}
                                onChange={(event) => onDirectSecretChange(event.target.value)}
                            />
                        )}
                    </Field>
                    {directType === 'aws' ? (
                        <Field label="Session token (선택)">
                            <Input
                                type="password"
                                value={sessionToken}
                                onChange={(event) => onSessionTokenChange(event.target.value)}
                            />
                        </Field>
                    ) : null}
                    <p className="flex items-center gap-1 text-[10px] leading-5 text-muted-foreground">
                        <Key /> 입력값은 저장 시 암호화되며, 이후 ‘저장된 키’에서도 선택할 수
                        있습니다.
                    </p>
                </div>
            )}
        </fieldset>
    )
}

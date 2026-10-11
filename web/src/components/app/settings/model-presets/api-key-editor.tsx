import type { ModelApiKey, ModelApiKeyInput, ProviderKind } from '@malang/shared'
import { Key } from '@phosphor-icons/react'
import { useState } from 'react'

import { EditorShell } from '@/components/form/editor-shell'
import { Field } from '@/components/form/field'
import { type Notice, NoticeBox } from '@/components/form/notice-box'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

import { PROVIDERS } from './provider-catalog'

export function ApiKeyEditor({
    credential,
    onSaved,
    onDeleted,
}: {
    credential: ModelApiKey | null
    onSaved: (id: string) => Promise<void>
    onDeleted: () => Promise<void>
}) {
    const [name, setName] = useState(credential?.name ?? '')
    const [provider, setProvider] = useState<ProviderKind>(credential?.provider ?? 'openai')
    const [type, setType] = useState<ModelApiKeyInput['credentialType']>(
        credential?.credentialType ?? 'apiKey',
    )
    const [secret, setSecret] = useState('')
    const [accessKeyId, setAccessKeyId] = useState('')
    const [sessionToken, setSessionToken] = useState('')
    const [notice, setNotice] = useState<Notice>(null)
    const auth = PROVIDERS.find((item) => item.id === provider)?.auth

    function selectProvider(next: ProviderKind) {
        const nextAuth = PROVIDERS.find((item) => item.id === next)?.auth
        setProvider(next)
        if (nextAuth === 'aws') setType('aws')
        else if (nextAuth !== 'vertex') setType('apiKey')
    }

    async function save() {
        try {
            const input: ModelApiKeyInput = {
                name,
                provider,
                credentialType: type,
                ...(type === 'apiKey' && secret ? { apiKey: secret } : {}),
                ...(type === 'serviceAccount' && secret ? { serviceAccountJson: secret } : {}),
                ...(type === 'aws' && secret
                    ? {
                          accessKeyId,
                          awsSecretAccessKey: secret,
                          awsSessionToken: sessionToken || undefined,
                      }
                    : {}),
            }
            const saved = credential
                ? await api.updateModelApiKey(credential.id, input)
                : await api.createModelApiKey(input)
            setSecret('')
            setSessionToken('')
            setNotice({ tone: 'success', text: '인증 정보를 암호화해 저장했습니다.' })
            await onSaved(saved.id)
        } catch (cause) {
            setNotice({
                tone: 'error',
                text: cause instanceof Error ? cause.message : '저장하지 못했습니다.',
            })
        }
    }

    return (
        <EditorShell
            title={credential?.name ?? '새 API 키'}
            onDelete={
                credential
                    ? async () => {
                          try {
                              await api.deleteModelApiKey(credential.id)
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
                      }
                    : undefined
            }
        >
            <Field label="표시 이름">
                <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="예: 개인 OpenRouter 키"
                />
            </Field>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                <Field label="Provider">
                    <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={provider}
                        onChange={(event) => selectProvider(event.target.value as ProviderKind)}
                    >
                        {PROVIDERS.filter(
                            (item) => !['none', 'unsupported'].includes(item.auth),
                        ).map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </Field>
                {auth === 'vertex' ? (
                    <Field label="인증 방식">
                        <select
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            value={type}
                            onChange={(event) => setType(event.target.value as typeof type)}
                        >
                            <option value="apiKey">API key</option>
                            <option value="serviceAccount">서비스 계정 JSON</option>
                        </select>
                    </Field>
                ) : null}
            </div>
            {type === 'aws' ? (
                <Field label="Access key ID">
                    <Input
                        value={accessKeyId}
                        onChange={(event) => setAccessKeyId(event.target.value)}
                        placeholder={credential?.hint}
                    />
                </Field>
            ) : null}
            <Field
                label={
                    type === 'serviceAccount'
                        ? '서비스 계정 JSON'
                        : type === 'aws'
                          ? 'Secret access key'
                          : 'API key'
                }
            >
                {type === 'serviceAccount' ? (
                    <Textarea
                        className="min-h-44 font-mono text-xs"
                        value={secret}
                        onChange={(event) => setSecret(event.target.value)}
                        placeholder={credential ? '저장된 JSON 유지 (교체할 때만 입력)' : '{ … }'}
                    />
                ) : (
                    <Input
                        type="password"
                        value={secret}
                        onChange={(event) => setSecret(event.target.value)}
                        placeholder={credential ? `저장된 값 유지 · ${credential.hint}` : ''}
                    />
                )}
            </Field>
            {type === 'aws' ? (
                <Field label="Session token (선택)">
                    <Input
                        type="password"
                        value={sessionToken}
                        onChange={(event) => setSessionToken(event.target.value)}
                    />
                </Field>
            ) : null}
            <NoticeBox notice={notice} />
            <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Key /> AES-256-GCM 암호화 저장
                </span>
                <Button type="button" onClick={save}>
                    {credential ? '변경 저장' : '키 저장'}
                </Button>
            </div>
        </EditorShell>
    )
}

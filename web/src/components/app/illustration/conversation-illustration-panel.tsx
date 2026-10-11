import type {
    ConversationIllustrationSettingsInput,
    IllustrationStyle,
    ModelPreset,
} from '@malang/shared'
import { useEffect, useState } from 'react'

import { Field } from '@/components/form/field'
import { SegmentedChoice } from '@/components/form/segmented-choice'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedSave } from '@/hooks/use-debounced-save'
import { api } from '@/lib/api'

import { CountFields } from './count-fields'

const INHERIT = '__inherit__'

export function ConversationIllustrationPanel({
    conversationId,
    modelPresets,
}: {
    conversationId: string
    modelPresets: ModelPreset[]
}) {
    const [loaded, setLoaded] = useState<{
        settings: ConversationIllustrationSettingsInput
        styles: IllustrationStyle[]
        defaultStyleName: string | null
    } | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true
        void Promise.all([
            api.conversationIllustrationSettings(conversationId),
            api.illustrationStyles(),
            api.illustrationSettings(),
        ])
            .then(([{ conversationId: _id, ...settings }, catalog, global]) => {
                if (!active) return
                setLoaded({
                    settings,
                    styles: catalog.styles,
                    defaultStyleName:
                        catalog.styles.find((style) => style.id === global.defaultStyleId)?.name ??
                        null,
                })
            })
            .catch((cause: unknown) => {
                if (active)
                    setError(cause instanceof Error ? cause.message : '불러오지 못했습니다.')
            })
        return () => {
            active = false
        }
    }, [conversationId])

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )
    }
    if (!loaded) return <Spinner />
    return (
        <ConversationIllustrationForm
            conversationId={conversationId}
            initial={loaded.settings}
            styles={loaded.styles}
            defaultStyleName={loaded.defaultStyleName}
            modelPresets={modelPresets}
        />
    )
}

function ConversationIllustrationForm({
    conversationId,
    initial,
    styles,
    defaultStyleName,
    modelPresets,
}: {
    conversationId: string
    initial: ConversationIllustrationSettingsInput
    styles: IllustrationStyle[]
    defaultStyleName: string | null
    modelPresets: ModelPreset[]
}) {
    const [draft, setDraft] = useState(initial)
    const autoSave = useDebouncedSave(draft, async (next) => {
        await api.saveConversationIllustrationSettings(conversationId, next)
    })

    function set<K extends keyof ConversationIllustrationSettingsInput>(
        key: K,
        value: ConversationIllustrationSettingsInput[K],
    ) {
        setDraft((current) => ({ ...current, [key]: value }))
    }

    return (
        <div className="grid gap-5" onBlurCapture={() => void autoSave.flush()}>
            <Label className="flex items-center justify-between gap-3 text-sm">
                <span className="grid gap-1">
                    <span>이 대화에서 삽화 사용</span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                        인물·의상·스타일은 캐릭터 편집기의 삽화 탭과 설정 &gt; 삽화 스타일에서
                        관리합니다.
                    </span>
                </span>
                <Switch
                    checked={draft.enabled}
                    onCheckedChange={(enabled) => set('enabled', enabled)}
                />
            </Label>
            <fieldset className="grid gap-5 disabled:opacity-60" disabled={!draft.enabled}>
                <Field
                    label="생성 방식"
                    description="자동은 응답이 끝나면 삽화를 만들고, 수동은 메시지의 삽화 버튼을 누를 때만 만듭니다."
                >
                    <SegmentedChoice
                        value={draft.mode}
                        options={[
                            { value: 'manual', label: '수동' },
                            { value: 'auto', label: '자동' },
                        ]}
                        onChange={(mode) =>
                            set('mode', mode as ConversationIllustrationSettingsInput['mode'])
                        }
                    />
                </Field>
                <CountFields value={draft.count} onChange={(count) => set('count', count)} />
                <Field label="스타일">
                    <Select
                        value={draft.styleId ?? INHERIT}
                        onValueChange={(next) =>
                            set('styleId', next === INHERIT ? null : String(next))
                        }
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                            <SelectItem value={INHERIT}>
                                기본 스타일{defaultStyleName ? ` (${defaultStyleName})` : ' (없음)'}
                            </SelectItem>
                            {styles.map((style) => (
                                <SelectItem key={style.id} value={style.id}>
                                    {style.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="분석 모델">
                    <Select
                        value={draft.analysisModelPresetId ?? INHERIT}
                        onValueChange={(next) =>
                            set('analysisModelPresetId', next === INHERIT ? null : String(next))
                        }
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                            <SelectItem value={INHERIT}>설정 &gt; 삽화의 분석 모델</SelectItem>
                            {modelPresets.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                    {preset.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <Field
                    label="장면 연출 지시문"
                    description="이 대화의 삽화에서 분석 AI가 따를 추가 지시입니다. 예: 인물 위주로, 배경은 넓게."
                >
                    <Textarea
                        rows={4}
                        value={draft.sceneDirection}
                        onChange={(event) => set('sceneDirection', event.target.value)}
                    />
                </Field>
            </fieldset>
            {autoSave.error ? (
                <Alert variant="destructive">
                    <AlertDescription>{autoSave.error}</AlertDescription>
                </Alert>
            ) : null}
        </div>
    )
}

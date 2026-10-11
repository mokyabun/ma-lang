import {
    DEFAULT_ANALYSIS_INSTRUCTION,
    type IllustrationSettings,
    type IllustrationStyle,
    type ImageSizePreset,
    type ModelPreset,
    type NovelAIImageParams,
} from '@malang/shared'
import { Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { CountFields } from '@/components/app/illustration/count-fields'
import { ImageParamsFields } from '@/components/app/illustration/image-params-fields'
import { StateDefinitionList } from '@/components/app/illustration/state-definitions'
import {
    TestImagePreview,
    useTestGeneration,
} from '@/components/app/illustration/test-image-preview'
import { Field } from '@/components/form/field'
import { SegmentedChoice } from '@/components/form/segmented-choice'
import { SettingsGroup } from '@/components/form/settings-group'
import { SectionHeading } from '@/components/page-heading'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedSave } from '@/hooks/use-debounced-save'
import { api } from '@/lib/api'

const NONE = '__none__'

type SettingsDraft = Omit<
    IllustrationSettings,
    'imageProvider' | 'novelaiApiKeyConfigured' | 'novelaiApiKeyLocked' | 'novelaiApiKeyHint'
>

function draftFrom(settings: IllustrationSettings): SettingsDraft {
    const {
        imageProvider: _provider,
        novelaiApiKeyConfigured: _configured,
        novelaiApiKeyLocked: _locked,
        novelaiApiKeyHint: _hint,
        ...draft
    } = settings
    return draft
}

function isSaveable(draft: SettingsDraft): boolean {
    return (
        draft.defaultCount.min <= draft.defaultCount.max &&
        draft.sizePresets.length > 0 &&
        draft.sizePresets.every((size) => /^[\w-]+$/.test(size.name)) &&
        new Set(draft.sizePresets.map((size) => size.name)).size === draft.sizePresets.length
    )
}

export function IllustrationSection({ modelPresets }: { modelPresets: ModelPreset[] }) {
    const [settings, setSettings] = useState<IllustrationSettings | null>(null)
    const [styles, setStyles] = useState<IllustrationStyle[]>([])
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true
        void Promise.all([api.illustrationSettings(), api.illustrationStyles()])
            .then(([loaded, catalog]) => {
                if (!active) return
                setSettings(loaded)
                setStyles(catalog.styles)
            })
            .catch((cause: unknown) => {
                if (active)
                    setError(cause instanceof Error ? cause.message : '불러오지 못했습니다.')
            })
        return () => {
            active = false
        }
    }, [])

    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <SectionHeading className="mb-6 pr-12 [&_h2]:text-2xl" title="삽화" />
            {error ? (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : settings ? (
                <IllustrationSettingsForm
                    settings={settings}
                    styles={styles}
                    modelPresets={modelPresets}
                    onSettingsChange={setSettings}
                />
            ) : (
                <Spinner />
            )}
        </div>
    )
}

function IllustrationSettingsForm({
    settings,
    styles,
    modelPresets,
    onSettingsChange,
}: {
    settings: IllustrationSettings
    styles: IllustrationStyle[]
    modelPresets: ModelPreset[]
    onSettingsChange: (settings: IllustrationSettings) => void
}) {
    const [draft, setDraft] = useState(() => draftFrom(settings))
    const autoSave = useDebouncedSave(
        draft,
        async (next) => onSettingsChange(await api.updateIllustrationSettings(next)),
        { enabled: isSaveable(draft) },
    )

    function set<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
        setDraft((current) => ({ ...current, [key]: value }))
    }

    return (
        <div className="grid gap-4" onBlurCapture={() => void autoSave.flush()}>
            <SettingsGroup title="NovelAI 연결" defaultOpen>
                <div className="grid gap-4">
                    <Field label="엔드포인트">
                        <Input
                            value={draft.novelaiEndpoint}
                            onChange={(event) => set('novelaiEndpoint', event.target.value)}
                        />
                    </Field>
                    <NovelAIKeyField settings={settings} onSettingsChange={onSettingsChange} />
                </div>
            </SettingsGroup>

            <SettingsGroup title="기본 이미지 파라미터" defaultOpen>
                <ImageParamsFields
                    value={draft.defaultImageParams}
                    onChange={(next) => set('defaultImageParams', next as NovelAIImageParams)}
                />
            </SettingsGroup>

            <SettingsGroup title="생성 기본값" defaultOpen>
                <div className="grid gap-4">
                    <Field
                        label="기본 모드"
                        description="새 대화에서 삽화를 켰을 때의 기본값입니다. 자동은 응답이 끝날 때마다 삽화를 만듭니다."
                    >
                        <SegmentedChoice
                            value={draft.defaultMode}
                            options={[
                                { value: 'manual', label: '수동' },
                                { value: 'auto', label: '자동' },
                            ]}
                            onChange={(mode) =>
                                set('defaultMode', mode as SettingsDraft['defaultMode'])
                            }
                        />
                    </Field>
                    <CountFields
                        value={draft.defaultCount}
                        onChange={(count) => set('defaultCount', count)}
                    />
                    <Field label="기본 스타일">
                        <Select
                            value={draft.defaultStyleId ?? NONE}
                            onValueChange={(next) =>
                                set('defaultStyleId', next === NONE ? null : String(next))
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="start">
                                <SelectItem value={NONE}>스타일 없음</SelectItem>
                                {styles.map((style) => (
                                    <SelectItem key={style.id} value={style.id}>
                                        {style.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
            </SettingsGroup>

            <SettingsGroup title="분석 AI" defaultOpen>
                <div className="grid gap-4">
                    <Field
                        label="분석 모델"
                        description="응답을 읽고 장면과 인물 태그를 정하는 모델입니다. 비워 두면 대화의 보조 모델, 그다음 메인 모델을 씁니다."
                    >
                        <Select
                            value={draft.analysisModelPresetId ?? NONE}
                            onValueChange={(next) =>
                                set('analysisModelPresetId', next === NONE ? null : String(next))
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="start">
                                <SelectItem value={NONE}>대화의 보조 모델 사용</SelectItem>
                                {modelPresets.map((preset) => (
                                    <SelectItem key={preset.id} value={preset.id}>
                                        {preset.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="함께 보낼 이전 메시지 수">
                        <Input
                            type="number"
                            min={0}
                            max={50}
                            value={draft.contextMessageCount}
                            onChange={(event) =>
                                set(
                                    'contextMessageCount',
                                    Math.min(
                                        50,
                                        Math.max(0, Math.round(Number(event.target.value) || 0)),
                                    ),
                                )
                            }
                        />
                    </Field>
                    <Field
                        label="연속성 추적"
                        description="등장인물·의상·누적 상태를 언제 갱신할지 정합니다."
                    >
                        <SegmentedChoice
                            value={draft.continuityTracking}
                            options={[
                                { value: 'with-illustration', label: '삽화를 만들 때만' },
                                { value: 'every-message', label: '모든 응답' },
                            ]}
                            onChange={(value) =>
                                set(
                                    'continuityTracking',
                                    value as SettingsDraft['continuityTracking'],
                                )
                            }
                        />
                    </Field>
                    <Field
                        label="분석 지시문"
                        description="비워 두면 Malang의 기본 지시문을 씁니다."
                    >
                        <Textarea
                            rows={10}
                            value={draft.analysisInstruction}
                            placeholder={DEFAULT_ANALYSIS_INSTRUCTION}
                            onChange={(event) => set('analysisInstruction', event.target.value)}
                        />
                    </Field>
                </div>
            </SettingsGroup>

            <SettingsGroup title="고정 프롬프트" defaultOpen>
                <div className="grid gap-4">
                    <Field
                        label="고정 긍정 프롬프트"
                        description="<<slot>> 자리에 스타일 장면 프롬프트가 들어갑니다. <<slot>>이 없으면 장면 프롬프트 앞에 붙습니다."
                    >
                        <Textarea
                            rows={3}
                            value={draft.fixedPositive}
                            placeholder="<<slot>>, no text"
                            onChange={(event) => set('fixedPositive', event.target.value)}
                        />
                    </Field>
                    <Field
                        label="고정 부정 프롬프트"
                        description="<<slot>> 자리에 스타일 네거티브가 들어갑니다. <<slot>>이 없으면 앞에 붙습니다."
                    >
                        <Textarea
                            rows={3}
                            value={draft.fixedNegative}
                            onChange={(event) => set('fixedNegative', event.target.value)}
                        />
                    </Field>
                </div>
            </SettingsGroup>

            <SettingsGroup title="크기 후보" meta={draft.sizePresets.length} defaultOpen>
                <SizePresetList
                    sizes={draft.sizePresets}
                    onChange={(sizes) => set('sizePresets', sizes)}
                />
            </SettingsGroup>

            <SettingsGroup title="누적 상태 (전역)">
                <StateDefinitionList characterId={null} />
            </SettingsGroup>

            <SettingsGroup title="테스트 생성">
                <PromptTestPanel />
            </SettingsGroup>

            {autoSave.error ? (
                <Alert variant="destructive">
                    <AlertDescription>{autoSave.error}</AlertDescription>
                </Alert>
            ) : null}
        </div>
    )
}

function NovelAIKeyField({
    settings,
    onSettingsChange,
}: {
    settings: IllustrationSettings
    onSettingsChange: (settings: IllustrationSettings) => void
}) {
    const [key, setKey] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function save(patch: { novelaiApiKey: string } | { clearNovelaiApiKey: true }) {
        setBusy(true)
        setError('')
        try {
            onSettingsChange(await api.updateIllustrationSettings(patch))
            setKey('')
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '키를 저장하지 못했습니다.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="grid gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                API 키
                {settings.novelaiApiKeyConfigured ? (
                    <Badge variant="secondary">
                        {settings.novelaiApiKeyLocked
                            ? '잠김 · 다시 로그인 필요'
                            : settings.novelaiApiKeyHint}
                    </Badge>
                ) : (
                    <Badge variant="outline">없음</Badge>
                )}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 max-sm:grid-cols-1">
                <Input
                    type="password"
                    autoComplete="off"
                    value={key}
                    placeholder="pst-..."
                    onChange={(event) => setKey(event.target.value)}
                />
                <Button
                    disabled={busy || !key.trim()}
                    onClick={() => void save({ novelaiApiKey: key.trim() })}
                >
                    저장
                </Button>
                <Button
                    variant="outline"
                    disabled={busy || !settings.novelaiApiKeyConfigured}
                    onClick={() => void save({ clearNovelaiApiKey: true })}
                >
                    삭제
                </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
                텍스트 모델 키와 별도로 암호화해 저장하며, 저장 후에는 다시 표시하지 않습니다.
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    )
}

function SizePresetList({
    sizes,
    onChange,
}: {
    sizes: ImageSizePreset[]
    onChange: (sizes: ImageSizePreset[]) => void
}) {
    function update(index: number, next: Partial<ImageSizePreset>) {
        onChange(sizes.map((size, position) => (position === index ? { ...size, ...next } : size)))
    }

    return (
        <div className="grid gap-2">
            <p className="text-[10px] text-muted-foreground">
                분석 AI가 장면마다 이 중 하나를 고릅니다. 이름은 영문·숫자·`_`·`-`만 쓸 수 있고,
                너비와 높이는 64의 배수여야 합니다.
            </p>
            {sizes.map((size, index) => (
                <div
                    key={index}
                    className="grid grid-cols-[minmax(0,1fr)_6rem_6rem_auto] items-center gap-2 max-sm:grid-cols-[minmax(0,1fr)_5rem_5rem_auto]"
                >
                    <Input
                        aria-label="크기 이름"
                        value={size.name}
                        onChange={(event) => update(index, { name: event.target.value.trim() })}
                    />
                    <Input
                        aria-label="너비"
                        type="number"
                        step={64}
                        value={size.width}
                        onChange={(event) => update(index, { width: Number(event.target.value) })}
                    />
                    <Input
                        aria-label="높이"
                        type="number"
                        step={64}
                        value={size.height}
                        onChange={(event) => update(index, { height: Number(event.target.value) })}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${size.name} 삭제`}
                        disabled={sizes.length <= 1}
                        onClick={() => onChange(sizes.filter((_, position) => position !== index))}
                    >
                        <Trash />
                    </Button>
                </div>
            ))}
            <Button
                variant="outline"
                disabled={sizes.length >= 8}
                onClick={() =>
                    onChange([
                        ...sizes,
                        { name: `size${sizes.length + 1}`, width: 1024, height: 1024 },
                    ])
                }
            >
                <Plus /> 크기 추가
            </Button>
        </div>
    )
}

function PromptTestPanel() {
    const [positive, setPositive] = useState('1girl, smile, looking at viewer, very aesthetic')
    const [negative, setNegative] = useState('')
    const test = useTestGeneration()

    return (
        <div className="grid gap-4">
            <p className="text-[10px] text-muted-foreground">
                입력한 프롬프트를 기본 이미지 파라미터로 그대로 생성합니다. 결과는 저장되지
                않습니다.
            </p>
            <Label className="grid gap-2 text-xs font-medium text-muted-foreground">
                긍정 프롬프트
                <Textarea
                    rows={3}
                    value={positive}
                    onChange={(event) => setPositive(event.target.value)}
                />
            </Label>
            <Label className="grid gap-2 text-xs font-medium text-muted-foreground">
                부정 프롬프트
                <Textarea
                    rows={2}
                    value={negative}
                    onChange={(event) => setNegative(event.target.value)}
                />
            </Label>
            <Button
                disabled={test.busy || !positive.trim()}
                onClick={() => void test.run(() => api.testIllustration({ positive, negative }))}
            >
                테스트 생성
            </Button>
            <TestImagePreview result={test.result} error={test.error} busy={test.busy} />
        </div>
    )
}

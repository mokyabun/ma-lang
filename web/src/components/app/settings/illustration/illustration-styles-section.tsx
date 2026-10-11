import type {
    IllustrationSettings,
    IllustrationStyle,
    IllustrationStyleInput,
} from '@malang/shared'
import { Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { ImageParamsFields } from '@/components/app/illustration/image-params-fields'
import { blankStyleInput, styleInputFrom } from '@/components/app/illustration/model'
import {
    TestImagePreview,
    useTestGeneration,
} from '@/components/app/illustration/test-image-preview'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

import { ConfirmDialog } from '../../dialogs/confirm-dialog'
import { SectionHeading } from '../../page-heading'
import { Field } from '../shared/field'
import { SettingsGroup } from '../shared/settings-group'

export function IllustrationStylesSection() {
    const [styles, setStyles] = useState<IllustrationStyle[] | null>(null)
    const [settings, setSettings] = useState<IllustrationSettings | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true
        void Promise.all([api.illustrationStyles(), api.illustrationSettings()])
            .then(([catalog, loaded]) => {
                if (!active) return
                setStyles(catalog.styles)
                setSettings(loaded)
                setSelectedId(catalog.styles[0]?.id ?? null)
            })
            .catch((cause: unknown) => {
                if (active)
                    setError(cause instanceof Error ? cause.message : '불러오지 못했습니다.')
            })
        return () => {
            active = false
        }
    }, [])

    const selected = styles?.find((style) => style.id === selectedId) ?? null

    async function create() {
        setError('')
        try {
            const style = await api.createIllustrationStyle(blankStyleInput())
            setStyles((current) => [...(current ?? []), style])
            setSelectedId(style.id)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '스타일을 만들지 못했습니다.')
        }
    }

    async function remove() {
        if (!selected) return
        await api.deleteIllustrationStyle(selected.id)
        const next = (styles ?? []).filter((style) => style.id !== selected.id)
        setStyles(next)
        setSelectedId(next[0]?.id ?? null)
    }

    function replace(saved: IllustrationStyle) {
        setStyles((current) =>
            (current ?? []).map((style) => (style.id === saved.id ? saved : style)),
        )
    }

    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <SectionHeading className="mb-6 pr-12 [&_h2]:text-2xl" title="삽화 스타일" />
            {!styles || !settings ? (
                error ? (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : (
                    <Spinner />
                )
            ) : (
                <div className="grid gap-5">
                    <p className="text-[11px] leading-5 text-muted-foreground">
                        스타일은 작가 태그·화풍과 생성 파라미터 묶음입니다. 장면 템플릿의
                        &lt;&lt;slot&gt;&gt; 자리에 분석 AI가 만든 장면 태그(인원 수, 구도, 카메라,
                        배경)가 들어갑니다.
                    </p>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 max-sm:grid-cols-1">
                        <Select
                            value={selectedId ?? '__none__'}
                            onValueChange={(next) => {
                                if (next && next !== '__none__') setSelectedId(String(next))
                            }}
                        >
                            <SelectTrigger size="lg" className="w-full font-medium text-foreground">
                                <SelectValue placeholder="스타일 선택" />
                            </SelectTrigger>
                            <SelectContent align="start">
                                {!selected ? (
                                    <SelectItem value="__none__" disabled>
                                        스타일 선택
                                    </SelectItem>
                                ) : null}
                                {styles.map((style) => (
                                    <SelectItem key={style.id} value={style.id}>
                                        {style.name}
                                        {settings.defaultStyleId === style.id ? ' · 기본' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="lg" onClick={() => void create()}>
                            <Plus /> 새 스타일
                        </Button>
                    </div>
                    {error ? (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : null}
                    {selected ? (
                        <StyleEditor
                            key={selected.id}
                            style={selected}
                            defaults={settings}
                            onSaved={replace}
                            onDelete={() => setDeleting(true)}
                        />
                    ) : (
                        <p className="border-y border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                            스타일이 없습니다. 새 스타일을 만들어 보세요.
                        </p>
                    )}
                </div>
            )}
            <ConfirmDialog
                open={deleting}
                title="스타일을 삭제할까요?"
                description="이 스타일을 쓰던 대화는 기본 스타일로 돌아갑니다."
                confirmLabel="삭제"
                onOpenChange={setDeleting}
                onConfirm={remove}
            />
        </div>
    )
}

function StyleEditor({
    style,
    defaults,
    onSaved,
    onDelete,
}: {
    style: IllustrationStyle
    defaults: IllustrationSettings
    onSaved: (style: IllustrationStyle) => void
    onDelete: () => void
}) {
    const [draft, setDraft] = useState<IllustrationStyleInput>(() => styleInputFrom(style))
    const autoSave = useDebouncedSave(
        draft,
        async (next) => onSaved(await api.updateIllustrationStyle(style.id, next)),
        { enabled: Boolean(draft.name.trim()) },
    )

    function set<K extends keyof IllustrationStyleInput>(key: K, value: IllustrationStyleInput[K]) {
        setDraft((current) => ({ ...current, [key]: value }))
    }

    return (
        <div className="grid gap-4" onBlurCapture={() => void autoSave.flush()}>
            <Field label="이름">
                <Input value={draft.name} onChange={(event) => set('name', event.target.value)} />
            </Field>
            <Field
                label="장면 템플릿"
                description="예: artist:foo, <<slot>>, very aesthetic, masterpiece, no text"
            >
                <Textarea
                    rows={4}
                    value={draft.sceneTemplate}
                    onChange={(event) => set('sceneTemplate', event.target.value)}
                />
            </Field>
            <Field label="네거티브">
                <Textarea
                    rows={3}
                    value={draft.negative}
                    onChange={(event) => set('negative', event.target.value)}
                />
            </Field>
            <SettingsGroup title="생성 파라미터" defaultOpen>
                <p className="mb-3 text-[10px] text-muted-foreground">
                    비워 둔 항목은 설정 &gt; 삽화의 기본 이미지 파라미터를 따릅니다.
                </p>
                <ImageParamsFields
                    value={draft.params}
                    fallback={defaults.defaultImageParams}
                    onChange={(params) => set('params', params)}
                />
            </SettingsGroup>
            <SettingsGroup title="테스트 생성">
                <StyleTestPanel styleId={style.id} beforeRun={() => autoSave.flush()} />
            </SettingsGroup>
            {autoSave.error ? (
                <Alert variant="destructive">
                    <AlertDescription>{autoSave.error}</AlertDescription>
                </Alert>
            ) : null}
            <Button variant="destructive" onClick={onDelete}>
                <Trash /> 스타일 삭제
            </Button>
        </div>
    )
}

function StyleTestPanel({
    styleId,
    beforeRun,
}: {
    styleId: string
    beforeRun: () => Promise<void>
}) {
    const [scene, setScene] = useState('1girl, solo, garden, day, upper body')
    const [character, setCharacter] = useState('')
    const test = useTestGeneration()

    return (
        <div className="grid gap-4">
            <p className="text-[10px] text-muted-foreground">
                장면 태그를 이 스타일과 고정 프롬프트로 조합해 생성합니다. 결과는 저장되지 않습니다.
            </p>
            <Label className="grid gap-2 text-xs font-medium text-muted-foreground">
                장면 태그
                <Textarea
                    rows={2}
                    value={scene}
                    onChange={(event) => setScene(event.target.value)}
                />
            </Label>
            <Label className="grid gap-2 text-xs font-medium text-muted-foreground">
                인물 프롬프트 (선택)
                <Textarea
                    rows={2}
                    value={character}
                    placeholder="1girl, silver hair, smile"
                    onChange={(event) => setCharacter(event.target.value)}
                />
            </Label>
            <Button
                disabled={test.busy}
                onClick={() =>
                    void test.run(async () => {
                        await beforeRun()
                        return api.testIllustrationStyle(styleId, {
                            scene,
                            characters: character.trim() ? [{ prompt: character }] : [],
                        })
                    })
                }
            >
                테스트 생성
            </Button>
            <TestImagePreview result={test.result} error={test.error} busy={test.busy} />
        </div>
    )
}

import type {
    IllustrationStateDefinition,
    IllustrationStateDefinitionInput,
    IllustrationStateKind,
} from '@malang/shared'
import { Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { ConfirmDialog } from '@/components/app/dialogs/confirm-dialog'
import { Field } from '@/components/app/settings/shared/field'
import { SegmentedChoice } from '@/components/app/settings/shared/segmented-choice'
import { SettingsGroup } from '@/components/app/settings/shared/settings-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedSave } from '@/hooks/use-debounced-save'
import { api } from '@/lib/api'

import { blankStateDefinition, isStateDefinitionSaveable, stateDefinitionInputFrom } from './model'

const KIND_LABELS: Record<IllustrationStateKind, string> = {
    flag: '켜기/끄기',
    counter: '횟수',
    choice: '선택지',
}

/** State definitions of one scope: a character's, or the global ones for null. */
export function StateDefinitionList({ characterId }: { characterId: string | null }) {
    const [definitions, setDefinitions] = useState<IllustrationStateDefinition[] | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<IllustrationStateDefinition | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true
        void api
            .stateDefinitions(characterId)
            .then((result) => {
                if (active) setDefinitions(result.definitions)
            })
            .catch((cause: unknown) => {
                if (active)
                    setError(cause instanceof Error ? cause.message : '불러오지 못했습니다.')
            })
        return () => {
            active = false
        }
    }, [characterId])

    async function create() {
        setError('')
        const taken = new Set((definitions ?? []).map((definition) => definition.key))
        let key = 'state'
        for (let suffix = 2; taken.has(key); suffix++) key = `state_${suffix}`
        try {
            const created = await api.createStateDefinition({
                ...blankStateDefinition(key),
                characterId,
            })
            setDefinitions((current) => [...(current ?? []), created])
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '상태를 만들지 못했습니다.')
        }
    }

    async function remove(definition: IllustrationStateDefinition) {
        await api.deleteStateDefinition(definition.id)
        setDefinitions((current) => (current ?? []).filter((item) => item.id !== definition.id))
    }

    if (!definitions) {
        return error ? (
            <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        ) : (
            <Spinner />
        )
    }

    return (
        <div className="grid gap-3">
            <p className="text-[10px] leading-5 text-muted-foreground">
                분석 AI가 응답을 읽고 인물마다 켜고 끄거나 세는 상태입니다. 값은 메시지를 넘어
                쌓이고, 캐릭터 템플릿의 &lt;&lt;state&gt;&gt; 자리에 태그로 들어갑니다.
                {characterId ? ' 같은 키의 전역 상태보다 우선합니다.' : ''}
            </p>
            {definitions.map((definition) => (
                <SettingsGroup
                    key={definition.id}
                    title={definition.label}
                    meta={`${definition.key} · ${KIND_LABELS[definition.kind]}`}
                >
                    <StateDefinitionEditor
                        definition={definition}
                        onSaved={(saved) =>
                            setDefinitions((current) =>
                                (current ?? []).map((item) =>
                                    item.id === saved.id ? saved : item,
                                ),
                            )
                        }
                        onDelete={() => setDeleteTarget(definition)}
                    />
                </SettingsGroup>
            ))}
            <Button variant="outline" onClick={() => void create()}>
                <Plus /> 상태 추가
            </Button>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <ConfirmDialog
                open={deleteTarget !== null}
                title="상태를 삭제할까요?"
                description="대화에 쌓인 이 상태의 값은 더 이상 프롬프트에 쓰이지 않습니다."
                confirmLabel="삭제"
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null)
                }}
                onConfirm={() => {
                    if (deleteTarget) void remove(deleteTarget)
                }}
            />
        </div>
    )
}

function StateDefinitionEditor({
    definition,
    onSaved,
    onDelete,
}: {
    definition: IllustrationStateDefinition
    onSaved: (definition: IllustrationStateDefinition) => void
    onDelete: () => void
}) {
    const [draft, setDraft] = useState(() => stateDefinitionInputFrom(definition))
    const autoSave = useDebouncedSave(
        draft,
        async (next) => onSaved(await api.updateStateDefinition(definition.id, next)),
        { enabled: isStateDefinitionSaveable(draft) },
    )

    function set<K extends keyof IllustrationStateDefinitionInput>(
        key: K,
        value: IllustrationStateDefinitionInput[K],
    ) {
        setDraft((current) => ({ ...current, [key]: value }))
    }

    return (
        <div className="grid gap-4" onBlurCapture={() => void autoSave.flush()}>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                <Field label="이름">
                    <Input
                        value={draft.label}
                        onChange={(event) => set('label', event.target.value)}
                    />
                </Field>
                <Field label="키" description="분석 AI가 쓰는 이름입니다. 영문·숫자·_·-">
                    <Input
                        value={draft.key}
                        onChange={(event) => set('key', event.target.value.trim())}
                    />
                </Field>
            </div>
            <Field label="종류">
                <SegmentedChoice
                    value={draft.kind}
                    options={(Object.keys(KIND_LABELS) as IllustrationStateKind[]).map((kind) => ({
                        value: kind,
                        label: KIND_LABELS[kind],
                    }))}
                    onChange={(kind) => set('kind', kind as IllustrationStateKind)}
                />
            </Field>
            <Field
                label="분석 AI 지시"
                description="언제 켜고, 늘리고, 바꾸고, 해제할지 적어 주세요."
            >
                <Textarea
                    rows={2}
                    value={draft.instruction}
                    placeholder="비에 젖으면 켜고, 옷을 갈아입거나 몸을 말리면 해제"
                    onChange={(event) => set('instruction', event.target.value)}
                />
            </Field>
            {draft.kind === 'flag' ? (
                <Field label="켜져 있을 때 태그">
                    <Input
                        value={draft.tags}
                        placeholder="wet, wet hair"
                        onChange={(event) => set('tags', event.target.value)}
                    />
                </Field>
            ) : null}
            {draft.kind === 'choice' ? (
                <TagRows
                    title="선택지"
                    rows={draft.options.map((option) => ({
                        head: option.value,
                        tags: option.tags,
                    }))}
                    headLabel="값"
                    headPlaceholder="light"
                    onChange={(rows) =>
                        set(
                            'options',
                            rows.map((row) => ({ value: row.head, tags: row.tags })),
                        )
                    }
                />
            ) : null}
            {draft.kind === 'counter' ? (
                <TagRows
                    title="구간"
                    description="값이 기준 이상이 되면 그 구간의 태그를 씁니다. 가장 높은 구간 하나만 적용됩니다."
                    rows={draft.thresholds.map((threshold) => ({
                        head: String(threshold.min),
                        tags: threshold.tags,
                    }))}
                    headLabel="기준"
                    headPlaceholder="1"
                    numeric
                    onChange={(rows) =>
                        set(
                            'thresholds',
                            rows.map((row) => ({ min: Number(row.head) || 0, tags: row.tags })),
                        )
                    }
                />
            ) : null}
            <Field
                label="지속 턴"
                description="비우면 해제될 때까지 유지합니다. 숫자를 넣으면 마지막으로 바뀐 뒤 그만큼의 응답 동안만 유지합니다."
            >
                <Input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.lifetimeTurns ?? ''}
                    placeholder="계속 유지"
                    onChange={(event) => {
                        const value = Math.round(Number(event.target.value))
                        set(
                            'lifetimeTurns',
                            event.target.value && value >= 1 ? Math.min(100, value) : null,
                        )
                    }}
                />
            </Field>
            {autoSave.error ? (
                <Alert variant="destructive">
                    <AlertDescription>{autoSave.error}</AlertDescription>
                </Alert>
            ) : null}
            <Button variant="outline" className="justify-self-start" onClick={onDelete}>
                <Trash /> 상태 삭제
            </Button>
        </div>
    )
}

function TagRows({
    title,
    description,
    rows,
    headLabel,
    headPlaceholder,
    numeric = false,
    onChange,
}: {
    title: string
    description?: string
    rows: Array<{ head: string; tags: string }>
    headLabel: string
    headPlaceholder: string
    numeric?: boolean
    onChange: (rows: Array<{ head: string; tags: string }>) => void
}) {
    function update(index: number, next: Partial<{ head: string; tags: string }>) {
        onChange(rows.map((row, position) => (position === index ? { ...row, ...next } : row)))
    }

    return (
        <div className="grid gap-2">
            <div className="text-xs font-medium text-muted-foreground">{title}</div>
            {description ? (
                <p className="text-[10px] text-muted-foreground">{description}</p>
            ) : null}
            {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] gap-2">
                    <Input
                        aria-label={headLabel}
                        type={numeric ? 'number' : 'text'}
                        value={row.head}
                        placeholder={headPlaceholder}
                        onChange={(event) => update(index, { head: event.target.value })}
                    />
                    <Input
                        aria-label={`${headLabel} 태그`}
                        value={row.tags}
                        placeholder="tags"
                        onChange={(event) => update(index, { tags: event.target.value })}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${title} 삭제`}
                        onClick={() => onChange(rows.filter((_, position) => position !== index))}
                    >
                        <Trash />
                    </Button>
                </div>
            ))}
            <Button
                variant="ghost"
                className="justify-self-start"
                onClick={() =>
                    onChange([...rows, { head: numeric ? String(rows.length + 1) : '', tags: '' }])
                }
            >
                <Plus /> {title} 추가
            </Button>
        </div>
    )
}

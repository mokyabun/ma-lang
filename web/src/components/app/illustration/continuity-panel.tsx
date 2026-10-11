import type {
    ContinuityUpdate,
    ConversationContinuity,
    IllustrationActor,
    IllustrationStateDefinition,
    IllustrationStateValue,
} from '@malang/shared'
import { ArrowUp, Lock, LockOpen } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { subscribeRuntimeEvents } from '@/lib/runtime-events'

import { continuityDraftFrom, withStateValue } from './model'

const DEFAULT_OUTFIT = '__default__'
const UNSET = '__unset__'

/** Who is in the scene, what they wear and their accumulated states, editable by hand. */
export function ContinuityPanel({ conversationId }: { conversationId: string }) {
    const [view, setView] = useState<ConversationContinuity | null>(null)
    const [draft, setDraft] = useState<ContinuityUpdate | null>(null)
    const [dirty, setDirtyState] = useState(false)
    const dirtyRef = useRef(false)
    const [busy, setBusy] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true
        const load = () =>
            void api
                .continuity(conversationId)
                .then((loaded) => {
                    if (!active) return
                    setView(loaded)
                    setDraft(continuityDraftFrom(loaded))
                    setDirty(false)
                })
                .catch((cause: unknown) => {
                    if (active)
                        setError(cause instanceof Error ? cause.message : '불러오지 못했습니다.')
                })
        load()
        const unsubscribe = subscribeRuntimeEvents((event) => {
            if (
                event.name === 'continuity.updated' &&
                event.data.conversationId === conversationId
            ) {
                // An analysis finishing must not wipe edits the user has not saved yet.
                if (!dirtyRef.current) load()
            }
        })
        return () => {
            active = false
            unsubscribe()
        }
    }, [conversationId])

    function setDirty(value: boolean) {
        dirtyRef.current = value
        setDirtyState(value)
    }

    function edit(update: (current: ContinuityUpdate) => ContinuityUpdate) {
        setDraft((current) => (current ? update(current) : current))
        setDirty(true)
    }

    async function save(next: ContinuityUpdate) {
        setBusy(true)
        setError('')
        try {
            const saved = await api.saveContinuity(conversationId, next)
            setView(saved)
            setDraft(continuityDraftFrom(saved))
            setDirty(false)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.')
        } finally {
            setBusy(false)
        }
    }

    async function promote(outfitId: string) {
        setError('')
        try {
            await api.promoteOutfit(outfitId)
            const loaded = await api.continuity(conversationId)
            setView(loaded)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '등록하지 못했습니다.')
        }
    }

    if (!view || !draft) {
        return error ? (
            <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        ) : (
            <Spinner />
        )
    }

    return (
        <div className="grid gap-4">
            <p className="text-[10px] leading-5 text-muted-foreground">
                {view.source === 'manual'
                    ? '직접 수정한 상태입니다.'
                    : view.source === 'analysis'
                      ? '최근 분석으로 갱신된 상태입니다.'
                      : '아직 기록된 상태가 없습니다.'}{' '}
                {view.state.turn}번째 응답 기준. 저장하면 최신 메시지에 기록되고, 다음 분석은 이
                상태에서 이어집니다.
            </p>
            {view.actors.length ? null : (
                <p className="text-center text-xs text-muted-foreground">
                    캐릭터 편집기의 삽화 탭에서 인물을 먼저 등록하세요.
                </p>
            )}
            {view.actors.map((actor) => (
                <ActorContinuity
                    key={actor.id}
                    actor={actor}
                    definitions={view.definitions}
                    draft={draft}
                    turn={view.state.turn}
                    onChange={edit}
                    onPromote={(outfitId) => void promote(outfitId)}
                />
            ))}
            {error ? (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={() => setResetting(true)}>
                    초기화
                </Button>
                <Button
                    variant="outline"
                    disabled={busy || !dirty}
                    onClick={() => {
                        setDraft(continuityDraftFrom(view))
                        setDirty(false)
                    }}
                >
                    되돌리기
                </Button>
                <Button disabled={busy || !dirty} onClick={() => void save(draft)}>
                    변경 저장
                </Button>
            </div>
            <ConfirmDialog
                open={resetting}
                title="연속성을 초기화할까요?"
                description="등장인물, 현재 의상, 누적 상태를 모두 비운 상태를 최신 메시지에 기록합니다."
                confirmLabel="초기화"
                onOpenChange={setResetting}
                onConfirm={() => save({ present: [], outfits: {}, states: {} })}
            />
        </div>
    )
}

function ActorContinuity({
    actor,
    definitions,
    draft,
    turn,
    onChange,
    onPromote,
}: {
    actor: IllustrationActor
    definitions: IllustrationStateDefinition[]
    draft: ContinuityUpdate
    turn: number
    onChange: (update: (current: ContinuityUpdate) => ContinuityUpdate) => void
    onPromote: (outfitId: string) => void
}) {
    const outfit = draft.outfits[actor.id] ?? { outfitId: null, locked: false }
    const worn = actor.outfits.find((item) => item.id === outfit.outfitId)
    const values = draft.states[actor.id] ?? {}
    const LockIcon = outfit.locked ? Lock : LockOpen

    function setOutfit(next: Partial<typeof outfit>) {
        onChange((current) => ({
            ...current,
            outfits: { ...current.outfits, [actor.id]: { ...outfit, ...next } },
        }))
    }

    function setState(
        definition: IllustrationStateDefinition,
        value: IllustrationStateValue['value'] | null,
    ) {
        onChange((current) => withStateValue(current, actor.id, definition, value, turn))
    }

    return (
        <section className="grid gap-3 rounded-md border border-border bg-background/30 p-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                    checked={draft.present.includes(actor.id)}
                    onCheckedChange={(checked) =>
                        onChange((current) => ({
                            ...current,
                            present: checked
                                ? [...current.present, actor.id]
                                : current.present.filter((id) => id !== actor.id),
                        }))
                    }
                />
                {actor.name}
                <span className="text-[10px] font-normal text-muted-foreground">
                    {draft.present.includes(actor.id) ? '등장 중' : '등장하지 않음'}
                    {actor.enabled ? '' : ' · 삽화에서 꺼짐'}
                </span>
            </Label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                <Select
                    value={outfit.outfitId ?? DEFAULT_OUTFIT}
                    onValueChange={(next) =>
                        setOutfit({ outfitId: next === DEFAULT_OUTFIT ? null : String(next) })
                    }
                >
                    <SelectTrigger className="w-full" aria-label={`${actor.name} 현재 의상`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                        <SelectItem value={DEFAULT_OUTFIT}>기본 의상</SelectItem>
                        {actor.outfits.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                                {item.name}
                                {item.conversationId ? ' (이 대화 한정)' : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    variant={outfit.locked ? 'secondary' : 'outline'}
                    size="icon"
                    aria-pressed={outfit.locked}
                    aria-label={outfit.locked ? '의상 잠금 해제' : '의상 잠금'}
                    title={
                        outfit.locked
                            ? '잠금: 분석 AI가 바꾸지 않습니다'
                            : '잠그면 분석 AI가 바꾸지 않습니다'
                    }
                    onClick={() => setOutfit({ locked: !outfit.locked })}
                >
                    <LockIcon />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    disabled={!worn?.conversationId}
                    aria-label="등록 의상으로 승격"
                    title="이 대화 한정 의상을 등록 의상으로 승격"
                    onClick={() => worn && onPromote(worn.id)}
                >
                    <ArrowUp />
                </Button>
            </div>
            {worn?.conversationId ? (
                <p className="text-[10px] text-muted-foreground">{worn.prompt}</p>
            ) : null}
            {definitions.length ? (
                <div className="grid gap-2">
                    {definitions.map((definition) => {
                        const entry = values[definition.key]
                        return (
                            <div
                                key={definition.key}
                                className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2 text-xs"
                            >
                                <span className="truncate">
                                    {definition.label}
                                    {entry?.expiresAfterTurn !== undefined ? (
                                        <span className="ml-1 text-[10px] text-muted-foreground">
                                            · {entry.expiresAfterTurn}번째 응답까지
                                        </span>
                                    ) : null}
                                </span>
                                <StateControl
                                    definition={definition}
                                    value={entry?.value}
                                    onChange={(value) => setState(definition, value)}
                                />
                            </div>
                        )
                    })}
                </div>
            ) : null}
        </section>
    )
}

function StateControl({
    definition,
    value,
    onChange,
}: {
    definition: IllustrationStateDefinition
    value: IllustrationStateValue['value'] | undefined
    onChange: (value: IllustrationStateValue['value'] | null) => void
}) {
    if (definition.kind === 'flag') {
        return (
            <Switch
                aria-label={definition.label}
                className="justify-self-end"
                checked={value === true}
                onCheckedChange={(checked) => onChange(checked ? true : null)}
            />
        )
    }
    if (definition.kind === 'counter') {
        return (
            <Input
                aria-label={definition.label}
                type="number"
                value={typeof value === 'number' ? value : ''}
                placeholder="없음"
                onChange={(event) =>
                    onChange(event.target.value === '' ? null : Number(event.target.value))
                }
            />
        )
    }
    return (
        <Select
            value={typeof value === 'string' ? value : UNSET}
            onValueChange={(next) => onChange(next === UNSET ? null : String(next))}
        >
            <SelectTrigger className="w-full" aria-label={definition.label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
                <SelectItem value={UNSET}>없음</SelectItem>
                {definition.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.value}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

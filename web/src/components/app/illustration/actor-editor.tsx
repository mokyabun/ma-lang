import type {
    IllustrationActor,
    IllustrationActorInput,
    IllustrationOutfitInput,
} from '@malang/shared'
import { Plus, Star, Trash } from '@phosphor-icons/react'
import { useState } from 'react'

import { Field } from '@/components/app/settings/shared/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedSave } from '@/hooks/use-debounced-save'
import { api } from '@/lib/api'

import { actorInputFrom, attachOutfitIds, blankOutfit, splitKeys, withDefaultOutfit } from './model'

export function ActorEditor({
    actor,
    onSaved,
    onDelete,
    keysDescription = '본문에 이 단어가 나오면 이 인물이 등장한 것으로 봅니다. 쉼표로 구분합니다.',
}: {
    actor: IllustrationActor
    onSaved: (actor: IllustrationActor) => void
    onDelete?: () => void
    keysDescription?: string
}) {
    const [draft, setDraft] = useState<IllustrationActorInput>(() => actorInputFrom(actor))
    const [keysText, setKeysText] = useState(() => actor.keys.join(', '))
    const autoSave = useDebouncedSave(
        draft,
        async (next) => {
            const saved = await api.updateIllustrationActor(actor.id, next)
            onSaved(saved)
            setDraft((current) => attachOutfitIds(current, next, saved))
        },
        {
            enabled:
                Boolean(draft.name.trim()) && draft.outfits.every((outfit) => outfit.name.trim()),
        },
    )

    function set<K extends keyof IllustrationActorInput>(key: K, value: IllustrationActorInput[K]) {
        setDraft((current) => ({ ...current, [key]: value }))
    }

    return (
        <div className="grid gap-4" onBlurCapture={() => void autoSave.flush()}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <Field label="이름">
                    <Input
                        value={draft.name}
                        onChange={(event) => set('name', event.target.value)}
                    />
                </Field>
                <Label className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                        checked={draft.enabled}
                        onCheckedChange={(enabled) => set('enabled', enabled)}
                    />
                    사용
                </Label>
            </div>
            <Field label="인식 키" description={keysDescription}>
                <Input
                    value={keysText}
                    onChange={(event) => {
                        setKeysText(event.target.value)
                        set('keys', splitKeys(event.target.value))
                    }}
                />
            </Field>
            <Field
                label="캐릭터 템플릿"
                description="<<slot>>에 분석 AI가 정한 표정·동작·자세, <<outfit>>에 현재 의상, <<state>>에 누적 상태가 들어갑니다. 없는 자리표시자는 <<slot>> 뒤에 붙습니다."
            >
                <Textarea
                    rows={3}
                    value={draft.promptTemplate}
                    placeholder="1girl, aria, silver hair, red eyes, <<slot>>, <<outfit>>, <<state>>"
                    onChange={(event) => set('promptTemplate', event.target.value)}
                />
            </Field>
            <Field label="네거티브">
                <Input
                    value={draft.negative}
                    onChange={(event) => set('negative', event.target.value)}
                />
            </Field>
            <OutfitListEditor
                outfits={draft.outfits}
                onChange={(outfits) => set('outfits', outfits)}
            />
            {autoSave.error ? (
                <Alert variant="destructive">
                    <AlertDescription>{autoSave.error}</AlertDescription>
                </Alert>
            ) : null}
            {onDelete ? (
                <Button variant="outline" className="justify-self-start" onClick={onDelete}>
                    <Trash /> 인물 삭제
                </Button>
            ) : null}
        </div>
    )
}

function OutfitListEditor({
    outfits,
    onChange,
}: {
    outfits: IllustrationOutfitInput[]
    onChange: (outfits: IllustrationOutfitInput[]) => void
}) {
    function update(index: number, next: Partial<IllustrationOutfitInput>) {
        onChange(
            outfits.map((outfit, position) =>
                position === index ? { ...outfit, ...next } : outfit,
            ),
        )
    }

    return (
        <section className="grid gap-3">
            <header className="flex items-center justify-between border-b border-border pb-2">
                <div>
                    <h4 className="text-sm font-semibold">의상</h4>
                    <p className="text-[10px] text-muted-foreground">
                        기본 의상은 대화를 시작할 때 입고 있는 옷입니다. 분석 AI가 장면에 맞춰
                        바꿉니다.
                    </p>
                </div>
                <Button
                    variant="ghost"
                    onClick={() => onChange([...outfits, blankOutfit(outfits.length === 0)])}
                >
                    <Plus /> 추가
                </Button>
            </header>
            {outfits.length ? null : (
                <p className="text-center text-[11px] text-muted-foreground">
                    등록된 의상이 없습니다.
                </p>
            )}
            {outfits.map((outfit, index) => (
                <div
                    // Index keys: a new outfit gains its id after saving and must not remount.
                    key={index}
                    className="grid gap-2 rounded-md border border-border bg-background/30 p-3"
                >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
                        <Input
                            aria-label="의상 이름"
                            value={outfit.name}
                            onChange={(event) => update(index, { name: event.target.value })}
                        />
                        <Button
                            variant={outfit.isDefault ? 'secondary' : 'ghost'}
                            size="icon"
                            aria-pressed={outfit.isDefault}
                            aria-label="기본 의상으로 지정"
                            title="기본 의상"
                            onClick={() => onChange(withDefaultOutfit(outfits, index))}
                        >
                            <Star weight={outfit.isDefault ? 'fill' : 'regular'} />
                        </Button>
                        <Switch
                            aria-label="의상 사용"
                            checked={outfit.enabled}
                            onCheckedChange={(enabled) => update(index, { enabled })}
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${outfit.name} 삭제`}
                            onClick={() =>
                                onChange(outfits.filter((_, position) => position !== index))
                            }
                        >
                            <Trash />
                        </Button>
                    </div>
                    <Textarea
                        aria-label="의상 프롬프트"
                        rows={2}
                        value={outfit.prompt}
                        placeholder="white blouse, black pleated skirt"
                        onChange={(event) => update(index, { prompt: event.target.value })}
                    />
                    <Input
                        aria-label="의상 네거티브"
                        value={outfit.negative}
                        placeholder="의상 네거티브 (선택)"
                        onChange={(event) => update(index, { negative: event.target.value })}
                    />
                </div>
            ))}
        </section>
    )
}

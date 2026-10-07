import type { Character, IllustrationActor, LoreEntry } from '@malang/shared'
import { BookOpenText, Plus } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { ConfirmDialog } from '@/components/app/dialogs/confirm-dialog'
import { SettingsGroup } from '@/components/app/settings/shared/settings-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/lib/api'

import { ActorEditor } from './actor-editor'
import { actorsFromLore, blankActorInput } from './model'
import { StateDefinitionList } from './state-definitions'

export function CharacterActors({
    character,
    lorebook,
}: {
    character: Character
    lorebook: LoreEntry[]
}) {
    const [actors, setActors] = useState<IllustrationActor[] | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<IllustrationActor | null>(null)
    const [importing, setImporting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true
        void api
            .illustrationActors({ characterId: character.id })
            .then((result) => {
                if (active) setActors(result.actors)
            })
            .catch((cause: unknown) => {
                if (active)
                    setError(cause instanceof Error ? cause.message : '불러오지 못했습니다.')
            })
        return () => {
            active = false
        }
    }, [character.id])

    async function create(names: Array<{ name: string; keys: string[] }>) {
        setError('')
        try {
            const created: IllustrationActor[] = []
            for (const item of names) {
                created.push(
                    await api.createIllustrationActor({
                        ...blankActorInput(item.name, item.keys),
                        characterId: character.id,
                    }),
                )
            }
            setActors((current) => [...(current ?? []), ...created])
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '인물을 추가하지 못했습니다.')
        }
    }

    async function remove(actor: IllustrationActor) {
        await api.deleteIllustrationActor(actor.id)
        setActors((current) => (current ?? []).filter((item) => item.id !== actor.id))
    }

    function replace(saved: IllustrationActor) {
        setActors((current) => (current ?? []).map((item) => (item.id === saved.id ? saved : item)))
    }

    if (!actors) {
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
            <p className="text-[11px] leading-5 text-muted-foreground">
                삽화에 그릴 등장인물입니다. 캐릭터 본인과 함께 등장하는 인물을 추가하고, 인물마다
                캐릭터 템플릿과 의상을 등록하세요.
            </p>
            <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                <Button
                    variant="outline"
                    onClick={() =>
                        void create([
                            {
                                name: actors.length ? '새 인물' : character.name,
                                keys: [],
                            },
                        ])
                    }
                >
                    <Plus /> {actors.length ? '인물 추가' : `${character.name} 추가`}
                </Button>
                <Button
                    variant="outline"
                    disabled={!lorebook.length}
                    onClick={() => setImporting(true)}
                >
                    <BookOpenText /> 로어북에서 가져오기
                </Button>
            </div>
            {error ? (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}
            {actors.map((actor) => (
                <SettingsGroup
                    key={actor.id}
                    title={actor.name}
                    meta={actor.enabled ? `의상 ${actor.outfits.length}` : '꺼짐'}
                    defaultOpen={actors.length === 1}
                >
                    <ActorEditor
                        actor={actor}
                        onSaved={replace}
                        onDelete={() => setDeleteTarget(actor)}
                    />
                </SettingsGroup>
            ))}
            {actors.length ? null : (
                <p className="border-y border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                    등록된 인물이 없습니다.
                </p>
            )}
            <section className="mt-6 grid gap-3 border-t border-border pt-5">
                <h4 className="font-serif text-lg">캐릭터 상태</h4>
                <StateDefinitionList characterId={character.id} />
            </section>
            <LoreImportDialog
                // Each opening starts with nothing selected.
                key={importing ? 'open' : 'closed'}
                open={importing}
                candidates={actorsFromLore(lorebook, actors)}
                onOpenChange={setImporting}
                onImport={(items) => void create(items)}
            />
            <ConfirmDialog
                open={deleteTarget !== null}
                title="인물을 삭제할까요?"
                description="이 인물의 템플릿과 등록 의상이 함께 삭제됩니다."
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

function LoreImportDialog({
    open,
    candidates,
    onOpenChange,
    onImport,
}: {
    open: boolean
    candidates: Array<{ name: string; keys: string[] }>
    onOpenChange: (open: boolean) => void
    onImport: (items: Array<{ name: string; keys: string[] }>) => void
}) {
    const [selected, setSelected] = useState<Set<string>>(new Set())

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[min(40rem,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto]">
                <DialogHeader>
                    <DialogTitle>로어북에서 가져오기</DialogTitle>
                    <DialogDescription>
                        고른 항목의 이름과 키로 인물을 만듭니다. 템플릿과 의상은 따로 채워야 합니다.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid min-h-0 content-start gap-1 overflow-y-auto">
                    {candidates.length ? (
                        candidates.map((candidate) => (
                            <Label
                                key={candidate.name}
                                className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
                            >
                                <Checkbox
                                    checked={selected.has(candidate.name)}
                                    onCheckedChange={(checked) =>
                                        setSelected((current) => {
                                            const next = new Set(current)
                                            if (checked) next.add(candidate.name)
                                            else next.delete(candidate.name)
                                            return next
                                        })
                                    }
                                />
                                <span className="grid gap-0.5">
                                    <span className="text-sm">{candidate.name}</span>
                                    <span className="truncate text-[10px] text-muted-foreground">
                                        {candidate.keys.join(', ') || '키 없음'}
                                    </span>
                                </span>
                            </Label>
                        ))
                    ) : (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                            가져올 수 있는 로어북 항목이 없습니다.
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        취소
                    </Button>
                    <Button
                        disabled={!selected.size}
                        onClick={() => {
                            onImport(candidates.filter((candidate) => selected.has(candidate.name)))
                            onOpenChange(false)
                        }}
                    >
                        {selected.size}명 추가
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

import type { IllustrationActor, Persona } from '@malang/shared'
import { Plus } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { ConfirmDialog } from '@/components/app/dialogs/confirm-dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

import { ActorEditor } from './actor-editor'
import { blankActorInput } from './model'

/** A persona is one person, so it has at most one illustration actor. */
export function PersonaActor({ persona }: { persona: Persona }) {
    const [actor, setActor] = useState<IllustrationActor | null | undefined>(undefined)
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true
        void api
            .illustrationActors({ personaId: persona.id })
            .then((result) => {
                if (active) setActor(result.actors[0] ?? null)
            })
            .catch((cause: unknown) => {
                if (active)
                    setError(cause instanceof Error ? cause.message : '불러오지 못했습니다.')
            })
        return () => {
            active = false
        }
    }, [persona.id])

    async function create() {
        setError('')
        try {
            setActor(
                await api.createIllustrationActor({
                    ...blankActorInput(persona.name),
                    personaId: persona.id,
                }),
            )
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '삽화 인물을 만들지 못했습니다.')
        }
    }

    async function remove() {
        if (!actor) return
        await api.deleteIllustrationActor(actor.id)
        setActor(null)
    }

    return (
        <section className="grid gap-3 border-t border-border pt-4">
            <header>
                <h4 className="text-sm font-semibold">삽화 인물</h4>
                <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
                    삽화에 이 페르소나를 그릴 때 쓰는 캐릭터 템플릿과 의상입니다.
                </p>
            </header>
            {actor === undefined ? null : actor ? (
                <ActorEditor
                    key={actor.id}
                    actor={actor}
                    keysDescription="본문에서 페르소나를 가리키는 말입니다. {{user}}로 바뀌는 이름은 자동으로 인식하지 않으니 함께 적어 주세요."
                    onSaved={setActor}
                    onDelete={() => setDeleting(true)}
                />
            ) : (
                <Button variant="outline" onClick={() => void create()}>
                    <Plus /> 삽화 인물 만들기
                </Button>
            )}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <ConfirmDialog
                open={deleting}
                title="삽화 인물을 삭제할까요?"
                description="이 페르소나의 캐릭터 템플릿과 의상이 함께 삭제됩니다."
                confirmLabel="삭제"
                onOpenChange={setDeleting}
                onConfirm={remove}
            />
        </section>
    )
}

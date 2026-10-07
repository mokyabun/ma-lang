import type { Persona } from '@malang/shared'
import { Trash, UploadSimple } from '@phosphor-icons/react'
import { useSetAtom } from 'jotai'
import { type ChangeEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedSave } from '@/lib/use-debounced-save'

import { PersonaActor } from '../../illustration/persona-actor'
import { removePersonaAvatarAtom, setPersonaAvatarAtom, updatePersonaAtom } from './atom'
import { personaDraftFrom } from './model'
import { PersonaAvatar } from './persona-avatar'

export function PersonaDetailForm({
    persona,
    onDelete,
}: {
    persona: Persona
    onDelete: () => void
}) {
    const [draft, setDraft] = useState(() => personaDraftFrom(persona))
    const updatePersona = useSetAtom(updatePersonaAtom)
    const setAvatar = useSetAtom(setPersonaAvatarAtom)
    const removeAvatar = useSetAtom(removePersonaAvatarAtom)
    const autoSave = useDebouncedSave(
        draft,
        async (next) => {
            await updatePersona({ id: persona.id, input: next })
        },
        { enabled: Boolean(draft.name?.trim()) },
    )

    function saveField(field: 'name' | 'description' | 'note', value: string) {
        setDraft((current) => ({ ...current, [field]: value }))
    }

    async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        await setAvatar({ id: persona.id, file })
    }

    return (
        <div
            className="grid gap-4 rounded-md border border-border bg-background/25 p-4"
            onBlurCapture={() => void autoSave.flush()}
        >
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-stretch gap-3 max-sm:grid-cols-[5rem_minmax(0,1fr)]">
                <PersonaAvatar persona={persona} className="aspect-square text-base" />
                <div className="grid content-end gap-2">
                    <Label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm font-medium transition-colors hover:border-ring hover:bg-accent/50">
                        <UploadSimple aria-hidden="true" />
                        <span>아바타 업로드</span>
                        <Input
                            className="sr-only"
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            onChange={(event) => void handleAvatarChange(event)}
                        />
                    </Label>
                    {persona.avatarAssetId ? (
                        <Button variant="outline" onClick={() => void removeAvatar(persona.id)}>
                            아바타 제거
                        </Button>
                    ) : null}
                </div>
            </div>
            <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                이름
                <Input
                    value={draft.name}
                    onChange={(event) => saveField('name', event.target.value)}
                    required
                />
            </Label>
            <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                설명 (프롬프트에 삽입됨)
                <Textarea
                    rows={6}
                    value={draft.description}
                    onChange={(event) => saveField('description', event.target.value)}
                    placeholder="이 페르소나가 어떤 사람인지 설명하세요."
                />
            </Label>
            <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                메모
                <Textarea
                    rows={2}
                    value={draft.note}
                    onChange={(event) => saveField('note', event.target.value)}
                    placeholder="모델에 전송되지 않습니다."
                />
                <span className="text-[10px] leading-5 text-muted-foreground">
                    모델에 전송되지 않습니다.
                </span>
            </Label>
            <PersonaActor persona={persona} />
            <Button variant="destructive" onClick={onDelete}>
                <Trash aria-hidden="true" /> 삭제
            </Button>
        </div>
    )
}

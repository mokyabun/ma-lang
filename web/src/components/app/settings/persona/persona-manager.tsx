import type { AppSettings } from '@malang/shared'
import { Plus } from '@phosphor-icons/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'

import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

import {
    activePersonaAtom,
    createPersonaAtom,
    deletePersonaAtom,
    editingPersonaIdAtom,
    loadPersonasAtom,
    personaErrorAtom,
    personaListAtom,
    selectPersonaAtom,
} from './atom'
import { blankPersonaDraft, personaLabel } from './model'
import { PersonaDetailForm } from './persona-detail-form'

export function PersonaManager({
    onSettingsChange,
}: {
    onSettingsChange: (settings: AppSettings) => void
}) {
    const personas = useAtomValue(personaListAtom)
    const activePersona = useAtomValue(activePersonaAtom)
    const [editingId, setEditingId] = useAtom(editingPersonaIdAtom)
    const error = useAtomValue(personaErrorAtom)
    const loadPersonas = useSetAtom(loadPersonasAtom)
    const createPersona = useSetAtom(createPersonaAtom)
    const deletePersona = useSetAtom(deletePersonaAtom)
    const selectPersona = useSetAtom(selectPersonaAtom)
    const [confirmDelete, setConfirmDelete] = useState(false)

    useEffect(() => {
        if (!personas.length) void loadPersonas()
    }, [loadPersonas, personas.length])

    useEffect(() => {
        setEditingId(activePersona?.id ?? null)
    }, [activePersona?.id, setEditingId])

    const editing = personas.find((persona) => persona.id === editingId) || null

    async function handleCreate() {
        const persona = await createPersona(blankPersonaDraft())
        if (!persona) return
        const settings = await selectPersona(persona.id)
        if (settings) {
            onSettingsChange(settings)
        } else {
            setEditingId(activePersona?.id ?? null)
        }
    }

    return (
        <div className="grid gap-5">
            <div className="grid gap-3">
                <Select
                    value={activePersona?.id || '__none__'}
                    onValueChange={(next) => {
                        if (!next || next === '__none__') return
                        void selectPersona(String(next)).then((settings) => {
                            if (settings) onSettingsChange(settings)
                        })
                    }}
                >
                    <SelectTrigger size="lg" className="w-full font-medium text-foreground">
                        <SelectValue placeholder="페르소나 선택" />
                    </SelectTrigger>
                    <SelectContent align="start">
                        {!activePersona ? (
                            <SelectItem value="__none__" disabled>
                                페르소나 선택
                            </SelectItem>
                        ) : null}
                        {personas.map((persona) => (
                            <SelectItem key={persona.id} value={persona.id}>
                                {personaLabel(persona)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    variant="outline"
                    onClick={() => void handleCreate()}
                    aria-label="페르소나 추가"
                >
                    <Plus aria-hidden="true" />
                    <span>새 페르소나</span>
                </Button>
            </div>

            {editing ? (
                <PersonaDetailForm
                    key={editing.id}
                    persona={editing}
                    onDelete={() => setConfirmDelete(true)}
                />
            ) : null}

            {error ? (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}

            <ConfirmDialog
                open={confirmDelete}
                title="페르소나를 삭제할까요?"
                description="이 페르소나를 사용하던 대화는 기본 활성 페르소나로 대체됩니다."
                confirmLabel="페르소나 삭제"
                onOpenChange={setConfirmDelete}
                onConfirm={() => {
                    if (editing) void deletePersona(editing.id)
                }}
            />
        </div>
    )
}

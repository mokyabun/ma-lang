import type { ModelChainPreset, ModelChainPresetInput, ModelPreset } from '@malang/shared'
import { useRef, useState } from 'react'

import { api } from '@/lib/api'

import {
    starterChain,
    chainInput,
    copyChain,
    firstAgent,
    normalizeImportedChain,
    safeFilename,
    errorText,
    validDraft,
} from './model'

export type ModelChainSectionProps = {
    presets: ModelChainPreset[]
    modelPresets: ModelPreset[]
    onChanged: (presets: ModelChainPreset[]) => void
}

export function useModelChainEditor({ modelPresets, onChanged }: ModelChainSectionProps) {
    const importRef = useRef<HTMLInputElement>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [draft, setDraft] = useState<ModelChainPresetInput | null>(null)
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [notice, setNotice] = useState('')
    const [showPreview, setShowPreview] = useState(false)
    function openDraft(next: ModelChainPresetInput, id: string | null) {
        setEditingId(id)
        setDraft(next)
        setSelectedAgentId(firstAgent(next)?.id ?? null)
        setShowPreview(false)
        setNotice('')
        setDialogOpen(true)
    }
    function beginCreate(source?: ModelChainPresetInput) {
        const modelPresetId = modelPresets[0]?.id
        if (!modelPresetId && !source) {
            setNotice('먼저 모델 프리셋을 하나 이상 만들어 주세요.')
            return
        }
        openDraft(source ? copyChain(source) : starterChain(modelPresetId!), null)
    }
    function beginEdit(preset: ModelChainPreset) {
        openDraft(chainInput(preset), preset.id)
    }
    async function refresh() {
        const result = await api.modelChains()
        onChanged(result.presets)
    }
    async function savePreset() {
        if (!draft || saving) return
        if (!validDraft(draft)) {
            setNotice('이름, 모델과 노드 연결을 확인해 주세요.')
            return
        }
        if (
            draft.layers.some((layer) =>
                layer.agents.some(
                    (agent) => !modelPresets.some((preset) => preset.id === agent.modelPresetId),
                ),
            )
        ) {
            setNotice(
                '사용할 수 없는 모델 프리셋이 있습니다. 에이전트의 모델을 다시 선택해 주세요.',
            )
            return
        }
        setSaving(true)
        setNotice('')
        try {
            if (editingId) await api.updateModelChain(editingId, draft)
            else await api.createModelChain(draft)
            await refresh()
            setDialogOpen(false)
        } catch (cause) {
            setNotice(errorText(cause, '체인 프리셋을 저장하지 못했습니다.'))
        } finally {
            setSaving(false)
        }
    }
    async function deletePreset() {
        if (!editingId || !draft || !window.confirm(`“${draft.name}” 체인을 삭제할까요?`)) return
        setSaving(true)
        try {
            await api.deleteModelChain(editingId)
            await refresh()
            setDialogOpen(false)
        } catch (cause) {
            setNotice(errorText(cause, '사용 중인 체인은 삭제할 수 없습니다.'))
        } finally {
            setSaving(false)
        }
    }
    function exportDraft() {
        if (!draft) return
        const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${safeFilename(draft.name)}.model-chain.json`
        anchor.click()
        URL.revokeObjectURL(url)
    }
    async function importDraft(file: File) {
        try {
            const imported = normalizeImportedChain(JSON.parse(await file.text()), modelPresets)
            openDraft(imported, null)
        } catch (cause) {
            setNotice(errorText(cause, '모델 체인 JSON을 읽지 못했습니다.'))
        } finally {
            if (importRef.current) importRef.current.value = ''
        }
    }
    return {
        importRef,
        dialogOpen,
        setDialogOpen,
        editingId,
        draft,
        setDraft,
        selectedAgentId,
        setSelectedAgentId,
        saving,
        notice,
        showPreview,
        setShowPreview,
        beginCreate,
        beginEdit,
        savePreset,
        deletePreset,
        exportDraft,
        importDraft,
    }
}

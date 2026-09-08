import {
    Check,
    Copy,
    DownloadSimple,
    FlowArrow,
    Plus,
    Trash,
    UploadSimple,
    WarningCircle,
} from '@phosphor-icons/react'
import { lazy, Suspense, useRef } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

import { SectionHeading } from '../../page-heading'
import { AgentInspector } from './agent-inspector'
import { firstAgent, findAgent, updateAgent, deleteAgent, validDraft } from './model'
import { PipelineSummary } from './pipeline-summary'
import { useModelChainEditor, type ModelChainSectionProps } from './use-model-chain-editor'

const PipelineCanvas = lazy(() =>
    import('./pipeline-canvas').then((module) => ({ default: module.PipelineCanvas })),
)

export function ModelChainSection({ presets, modelPresets, onChanged }: ModelChainSectionProps) {
    const canvasRef = useRef<HTMLElement>(null)
    const inspectorRef = useRef<HTMLElement>(null)
    const {
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
    } = useModelChainEditor({ presets, modelPresets, onChanged })
    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <div className="w-full">
                <SectionHeading className="mb-5 pr-12 [&_h2]:text-2xl" title="모델 체이닝" />
                {notice && !dialogOpen ? (
                    <Alert className="mb-4 border-destructive/30 bg-destructive/5 text-destructive">
                        <WarningCircle aria-hidden="true" />
                        <AlertDescription>{notice}</AlertDescription>
                    </Alert>
                ) : null}
                {!modelPresets.length ? (
                    <p className="mb-4 text-sm text-muted-foreground">
                        먼저 모델 프리셋을 하나 이상 만들어 주세요.
                    </p>
                ) : null}
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                        <div>
                            <p className="text-xs text-muted-foreground">
                                저장된 실행 흐름 {presets.length}개
                            </p>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => beginCreate()}
                            disabled={!modelPresets.length}
                        >
                            <Plus aria-hidden="true" />새 파이프라인
                        </Button>
                    </div>
                    {presets.length ? (
                        <div className="divide-y divide-border">
                            {presets.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    className="group grid w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/45 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                                    onClick={() => beginEdit(preset)}
                                >
                                    <span className="min-w-0">
                                        <strong className="block truncate text-sm font-medium">
                                            {preset.name}
                                        </strong>
                                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                                            {preset.description || '설명 없음'}
                                        </span>
                                    </span>
                                    <PipelineSummary preset={preset} />
                                    <span className="hidden text-xs text-muted-foreground group-hover:text-foreground sm:block">
                                        편집
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="grid w-full place-items-center px-6 py-16 text-center hover:bg-muted/30"
                            onClick={() => beginCreate()}
                            disabled={!modelPresets.length}
                        >
                            <span>
                                <FlowArrow className="mx-auto mb-3 size-7 text-primary" />
                                <strong className="block text-sm font-medium">
                                    첫 파이프라인을 만들어 보세요
                                </strong>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                    모델 노드를 추가하고 연결점을 드래그해 실행 흐름을 구성하세요.
                                </span>
                            </span>
                        </button>
                    )}
                </div>
            </div>

            <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importDraft(file)
                }}
            />

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    if (!saving) setDialogOpen(open)
                }}
            >
                <DialogContent
                    className="h-[min(58rem,calc(100dvh-1rem))] w-[min(96rem,calc(100%-1rem))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-card p-0 sm:max-w-none"
                    showCloseButton={!saving}
                >
                    {draft ? (
                        <>
                            <DialogHeader className="border-b border-border px-5 py-4 pr-14 sm:px-6">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <DialogTitle className="font-serif text-xl">
                                            {editingId ? '파이프라인 수정' : '새 파이프라인'}
                                        </DialogTitle>
                                    </div>
                                    <div className="mr-5 flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={exportDraft}
                                            disabled={saving}
                                        >
                                            <DownloadSimple />
                                            내보내기
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => importRef.current?.click()}
                                            disabled={saving}
                                        >
                                            <UploadSimple />
                                            가져오기
                                        </Button>
                                    </div>
                                </div>
                                {notice ? (
                                    <Alert className="mt-3 border-destructive/30 bg-destructive/5 text-destructive">
                                        <WarningCircle aria-hidden="true" />
                                        <AlertDescription>{notice}</AlertDescription>
                                    </Alert>
                                ) : null}
                            </DialogHeader>

                            <fieldset
                                disabled={saving}
                                className="min-h-0 min-w-0 overflow-y-auto border-0 p-0 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden"
                            >
                                <Suspense
                                    fallback={
                                        <output className="grid min-h-80 place-items-center text-sm text-muted-foreground">
                                            노드 편집기를 불러오는 중입니다…
                                        </output>
                                    }
                                >
                                    <PipelineCanvas
                                        draft={draft}
                                        disabled={saving}
                                        selectedAgentId={selectedAgentId}
                                        modelPresets={modelPresets}
                                        onChange={setDraft}
                                        onSelect={setSelectedAgentId}
                                        panelRef={canvasRef}
                                        onInspect={() =>
                                            inspectorRef.current?.scrollIntoView({ block: 'start' })
                                        }
                                    />
                                </Suspense>
                                <AgentInspector
                                    panelRef={inspectorRef}
                                    onShowCanvas={() =>
                                        canvasRef.current?.scrollIntoView({ block: 'start' })
                                    }
                                    selection={findAgent(draft, selectedAgentId)}
                                    modelPresets={modelPresets}
                                    showPreview={showPreview}
                                    onPreview={() => setShowPreview((value) => !value)}
                                    onChange={(agent) => setDraft(updateAgent(draft, agent))}
                                    onDelete={() => {
                                        const next = deleteAgent(draft, selectedAgentId)
                                        setDraft(next)
                                        setSelectedAgentId(firstAgent(next)?.id ?? null)
                                    }}
                                />
                            </fieldset>

                            <DialogFooter className="items-center justify-between border-t border-border bg-muted/25 px-5 py-3 sm:px-6">
                                <div className="flex items-center gap-1 self-stretch sm:self-auto">
                                    {editingId ? (
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => void deletePreset()}
                                            disabled={saving}
                                        >
                                            <Trash />
                                            파이프라인 삭제
                                        </Button>
                                    ) : null}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => beginCreate(draft)}
                                        disabled={saving}
                                    >
                                        <Copy />
                                        복사본
                                    </Button>
                                </div>
                                <div className="flex items-center justify-end gap-2 self-stretch sm:self-auto">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDialogOpen(false)}
                                        disabled={saving}
                                    >
                                        취소
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => void savePreset()}
                                        disabled={
                                            saving ||
                                            !validDraft(draft) ||
                                            draft.layers.some((layer) =>
                                                layer.agents.some(
                                                    (agent) =>
                                                        !modelPresets.some(
                                                            (preset) =>
                                                                preset.id === agent.modelPresetId,
                                                        ),
                                                ),
                                            )
                                        }
                                    >
                                        <Check />
                                        {saving ? '저장 중' : '파이프라인 저장'}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    )
}

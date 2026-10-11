import {
    getChainGraph,
    planChainExecution,
    type ModelChainPresetInput,
    type ModelPreset,
} from '@malang/shared'
import { ArrowsClockwise, Crosshair, Plus, Trash } from '@phosphor-icons/react'
import {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    ReactFlow,
    ReactFlowProvider,
    useNodesInitialized,
    useReactFlow,
    useStore,
    type NodeChange,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type Ref } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { chainEdgeTypes } from './flow-edges'
import { agentNodeId, buildChainFlow, saveFlowPositions, type ChainFlowNode } from './flow-model'
import { chainNodeTypes, FlowActionsContext } from './flow-nodes'
import {
    addNode,
    CHAIN_LIMITS,
    connectNodes,
    deleteGraphElements,
    findAgent,
    totalAgents,
} from './model'

import '@xyflow/react/dist/style.css'
import './pipeline-flow.css'

type PipelineCanvasProps = {
    draft: ModelChainPresetInput
    selectedAgentId: string | null
    modelPresets: ModelPreset[]
    disabled?: boolean
    onChange: (draft: ModelChainPresetInput) => void
    onSelect: (id: string | null) => void
    onInspect: () => void
    panelRef: Ref<HTMLElement>
}
const fitOptions = { padding: 0.16, maxZoom: 0.9, minZoom: 0.08 }
const miniMapStyle = { width: 128, height: 80 }
const flowAriaLabels = {
    'controls.zoomIn.ariaLabel': '캔버스 확대',
    'controls.zoomOut.ariaLabel': '캔버스 축소',
    'controls.fitView.ariaLabel': '전체 흐름 보기',
    'minimap.ariaLabel': '파이프라인 미니맵',
    'node.a11yDescription.default':
        '노드를 선택해 편집합니다. 연결점을 드래그해 연결하고 Delete 키로 선택한 노드나 연결을 삭제합니다.',
}

function FitLayout({ revision }: { revision: number }) {
    const initialized = useNodesInitialized()
    const { fitView } = useReactFlow()
    const width = useStore((state) => state.width)
    const height = useStore((state) => state.height)
    useEffect(() => {
        if (initialized) void fitView(fitOptions)
    }, [initialized, revision, fitView, width, height])
    return null
}

function FlowCanvas({
    draft,
    selectedAgentId,
    modelPresets,
    disabled = false,
    onChange,
    onSelect,
    onInspect,
    panelRef,
}: PipelineCanvasProps) {
    const [layoutRevision, setLayoutRevision] = useState(0)
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
    const reconnecting = useRef<string | undefined>(undefined)
    const [measurements, setMeasurements] = useState<
        Record<string, { width: number; height: number }>
    >({})
    const { fitView, screenToFlowPosition } = useReactFlow<ChainFlowNode>()
    const canvasRef = useRef<HTMLDivElement>(null)
    const graph = useMemo(() => {
        const projected = buildChainFlow(draft, modelPresets, selectedAgentId)
        return {
            nodes: projected.nodes.map((node) => ({ ...node, measured: measurements[node.id] })),
            edges: projected.edges.map((edge) => ({
                ...edge,
                selected: edge.id === selectedEdgeId,
            })),
        }
    }, [draft, modelPresets, selectedAgentId, measurements, selectedEdgeId])
    const modelPresetId = modelPresets[0]?.id ?? ''
    const orphanCount = planChainExecution(draft).orphans.length

    function selectAgent(id: string | null) {
        setSelectedEdgeId(null)
        onSelect(id)
    }
    function commit(next: ModelChainPresetInput) {
        if (disabled || next === draft) return
        onChange(saveFlowPositions(next, graph.nodes))
        if (selectedAgentId && !findAgent(next, selectedAgentId)) onSelect(null)
    }
    function handleNodesChange(changes: NodeChange<ChainFlowNode>[]) {
        const dimensions = changes.filter((change) => change.type === 'dimensions')
        if (dimensions.length)
            setMeasurements((current) => {
                const next = { ...current }
                let changed = false
                for (const change of dimensions) {
                    if (change.type !== 'dimensions' || !change.dimensions) continue
                    if (
                        current[change.id]?.width !== change.dimensions.width ||
                        current[change.id]?.height !== change.dimensions.height
                    ) {
                        next[change.id] = change.dimensions
                        changed = true
                    }
                }
                return changed ? next : current
            })
        if (disabled) return
        const selected = changes.find((change) => change.type === 'select' && change.selected)
        if (selected?.type === 'select') {
            const node = graph.nodes.find((node) => node.id === selected.id)
            if (node?.type === 'chainAgent') selectAgent(node.data.agent.id)
        }
        const moves = changes.filter((change) => change.type === 'position' && change.position)
        if (moves.length) {
            const next = saveFlowPositions(draft, graph.nodes)
            const positions = { ...next.graph!.positions }
            for (const move of moves)
                if (move.type === 'position' && move.position) positions[move.id] = move.position
            onChange({ ...next, graph: { ...next.graph!, positions } })
        }
    }
    function remove(nodeIds: string[], edgeIds: string[]) {
        commit(deleteGraphElements(draft, nodeIds, edgeIds))
        setSelectedEdgeId(null)
    }

    return (
        <section
            ref={panelRef}
            aria-label="파이프라인 노드 편집기"
            className="flex min-h-0 min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r"
        >
            <div className="grid shrink-0 gap-3 border-b border-border p-4 sm:grid-cols-2">
                <Label className="grid gap-1.5 text-xs text-muted-foreground">
                    <span>파이프라인 이름</span>
                    <Input
                        value={draft.name}
                        maxLength={100}
                        onChange={(event) => onChange({ ...draft, name: event.target.value })}
                    />
                </Label>
                <Label className="grid gap-1.5 text-xs text-muted-foreground">
                    <span>설명</span>
                    <Input
                        value={draft.description}
                        maxLength={1000}
                        onChange={(event) =>
                            onChange({ ...draft, description: event.target.value })
                        }
                    />
                </Label>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex flex-wrap gap-1">
                    <Button
                        variant="outline"
                        size="xs"
                        disabled={!modelPresetId || totalAgents(draft) >= CHAIN_LIMITS.agents}
                        onClick={() => {
                            const rect = canvasRef.current?.getBoundingClientRect()
                            const position = rect
                                ? screenToFlowPosition({
                                      x: rect.x + rect.width / 2,
                                      y: rect.y + rect.height / 2,
                                  })
                                : undefined
                            if (position) {
                                position.x -= 136
                                position.y -= 68
                                while (
                                    graph.nodes.some(
                                        (node) =>
                                            Math.abs(node.position.x - position.x) < 40 &&
                                            Math.abs(node.position.y - position.y) < 40,
                                    )
                                ) {
                                    position.x += 48
                                    position.y += 48
                                }
                            }
                            const next = addNode(draft, modelPresetId, position)
                            commit(next)
                            selectAgent(next.layers.at(-1)?.agents[0]?.id ?? null)
                        }}
                    >
                        <Plus /> 노드 추가
                    </Button>
                    <Button
                        variant="ghost"
                        size="xs"
                        disabled={!selectedAgentId && !selectedEdgeId}
                        onClick={() =>
                            remove(
                                selectedAgentId ? [agentNodeId(selectedAgentId)] : [],
                                selectedEdgeId ? [selectedEdgeId] : [],
                            )
                        }
                    >
                        <Trash /> {selectedEdgeId ? '연결 끊기' : '선택 삭제'}
                    </Button>
                </div>
                <div className="flex gap-1">
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                            const next = {
                                ...draft,
                                graph: { ...getChainGraph(draft), positions: {} },
                            }
                            onChange(
                                saveFlowPositions(
                                    next,
                                    buildChainFlow(next, modelPresets, selectedAgentId).nodes,
                                ),
                            )
                            setLayoutRevision((value) => value + 1)
                        }}
                    >
                        <ArrowsClockwise /> 자동 정렬
                    </Button>
                    <Button
                        variant="ghost"
                        size="xs"
                        disabled={!selectedAgentId}
                        onClick={() => {
                            if (selectedAgentId)
                                void fitView({
                                    nodes: [{ id: agentNodeId(selectedAgentId) }],
                                    padding: 0.6,
                                    maxZoom: 1,
                                })
                        }}
                    >
                        <Crosshair /> 선택 노드
                    </Button>
                    <Button variant="ghost" size="xs" className="lg:hidden" onClick={onInspect}>
                        상세 설정
                    </Button>
                </div>
            </div>
            <div
                ref={canvasRef}
                className="chain-flow h-[26rem] min-h-[26rem] w-full bg-background lg:h-auto lg:min-h-64 lg:flex-1"
            >
                <FlowActionsContext.Provider
                    value={{
                        onSelect: selectAgent,
                        onDisconnect: (id) => remove([], [id]),
                        disabled,
                    }}
                >
                    <ReactFlow<ChainFlowNode>
                        nodes={graph.nodes}
                        edges={graph.edges}
                        nodeTypes={chainNodeTypes}
                        edgeTypes={chainEdgeTypes}
                        onNodesChange={handleNodesChange}
                        onEdgeClick={(event, edge) => {
                            if (disabled) return
                            event.stopPropagation()
                            onSelect(null)
                            setSelectedEdgeId(edge.id)
                        }}
                        onEdgesChange={(changes) => {
                            const selected = changes.find(
                                (change) => change.type === 'select' && change.selected,
                            )
                            if (selected?.type === 'select' && !disabled) {
                                onSelect(null)
                                setSelectedEdgeId(selected.id)
                            } else if (
                                changes.some(
                                    (change) =>
                                        change.type === 'select' &&
                                        change.id === selectedEdgeId &&
                                        !change.selected,
                                )
                            ) {
                                setSelectedEdgeId(null)
                            }
                        }}
                        onPaneClick={() => selectAgent(null)}
                        onConnect={({ source, target }) =>
                            commit(connectNodes(draft, source, target))
                        }
                        isValidConnection={({ source, target }) =>
                            Boolean(
                                source &&
                                target &&
                                connectNodes(draft, source, target, reconnecting.current) !== draft,
                            )
                        }
                        onReconnectStart={(_, edge) => {
                            reconnecting.current = edge.id
                        }}
                        onReconnect={(edge, connection) =>
                            commit(
                                connectNodes(draft, connection.source, connection.target, edge.id),
                            )
                        }
                        onReconnectEnd={() => {
                            reconnecting.current = undefined
                        }}
                        onDelete={({ nodes, edges }) =>
                            remove(
                                nodes.map((node) => node.id),
                                edges.map((edge) => edge.id),
                            )
                        }
                        nodesConnectable={!disabled}
                        nodesDraggable={!disabled}
                        elementsSelectable={!disabled}
                        edgesReconnectable={!disabled}
                        deleteKeyCode={disabled ? null : ['Backspace', 'Delete']}
                        multiSelectionKeyCode={null}
                        selectionOnDrag={false}
                        minZoom={0.08}
                        maxZoom={1.8}
                        fitView
                        fitViewOptions={fitOptions}
                        zoomOnDoubleClick={false}
                        zoomOnScroll={false}
                        panOnScroll
                        ariaLabelConfig={flowAriaLabels}
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={24}
                            size={1}
                            color="var(--border)"
                        />
                        <Controls showInteractive={false} fitViewOptions={fitOptions} />
                        <MiniMap
                            style={miniMapStyle}
                            className="!hidden sm:!block"
                            pannable
                            zoomable
                            nodeColor="var(--muted)"
                            nodeStrokeColor="var(--primary)"
                            maskColor="color-mix(in srgb, var(--background) 75%, transparent)"
                        />
                        <FitLayout revision={layoutRevision} />
                    </ReactFlow>
                </FlowActionsContext.Provider>
            </div>
            <div className="shrink-0 space-y-1 border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
                <p>
                    오른쪽 연결점 → 왼쪽 연결점으로 드래그하세요. 화살표 순서에 따라 실행하며,
                    합류한 노드는 연결된 선행 노드가 끝나면 실행됩니다.
                </p>
                <p>
                    연결선을 클릭하면 강조되며, 선 위의 ‘연결 끊기’ 버튼으로 해제할 수 있습니다.
                    Delete/Backspace도 사용할 수 있습니다. 기본 응답 모델과 어떤 경로로도 이어지지
                    않은 고아 노드만 실행에서 제외됩니다. 순환 연결은 허용하지 않습니다.
                </p>
                <p className="font-mono">
                    모델 노드 {totalAgents(draft)}/{CHAIN_LIMITS.agents} · 고아 노드 {orphanCount}개
                    · 노드 위치도 함께 저장
                </p>
            </div>
        </section>
    )
}

export function PipelineCanvas(props: PipelineCanvasProps) {
    return (
        <ReactFlowProvider>
            <FlowCanvas {...props} />
        </ReactFlowProvider>
    )
}

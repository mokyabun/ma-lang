import {
    chainAgentNodeId,
    CHAIN_MAIN_NODE_ID,
    getChainGraph,
    planChainExecution,
    type ModelChainAgent,
    type ModelChainPresetInput,
    type ModelPreset,
} from '@malang/shared'
import { MarkerType, type Edge, type Node, type XYPosition } from '@xyflow/react'

export const FLOW_LAYOUT = { nodeWidth: 272, nodeHeight: 136, columnGap: 100, rowGap: 40 } as const
export type AgentFlowNode = Node<
    {
        agent: ModelChainAgent
        orphan: boolean
        receivesResponse: boolean
        modelName: string
        missingModel: boolean
    },
    'chainAgent'
>
export type MainFlowNode = Node<Record<string, never>, 'chainMain'>
export type ChainFlowNode = AgentFlowNode | MainFlowNode
export type FlowPositions = Record<string, XYPosition>
export const agentNodeId = chainAgentNodeId
export const MAIN_NODE_ID = CHAIN_MAIN_NODE_ID

export function buildChainFlow(
    draft: ModelChainPresetInput,
    modelPresets: ModelPreset[],
    selectedAgentId: string | null,
): { nodes: ChainFlowNode[]; edges: Edge[] } {
    const { nodeWidth, nodeHeight, columnGap, rowGap } = FLOW_LAYOUT
    const graph = getChainGraph(draft)
    const plan = planChainExecution(draft)
    const models = new Map(modelPresets.map((model) => [model.id, model.name]))
    const defaults: FlowPositions = {}
    const connected = new Map(plan.nodes.map((node) => [node.id, node]))
    const stages = plan.batches
    const maxRows = Math.max(1, ...stages.map((stage) => stage.length))
    stages.forEach((stage, column) => {
        const ids = stage.map((node) => node.id)
        ids.forEach((id, row) => {
            defaults[id] = {
                x: column * (nodeWidth + columnGap),
                y: (row + (maxRows - ids.length) / 2) * (nodeHeight + rowGap),
            }
        })
    })
    plan.orphans.forEach((node, index) => {
        defaults[node.id] = {
            x: (index % 3) * (nodeWidth + columnGap),
            y: (maxRows + 1 + Math.floor(index / 3)) * (nodeHeight + rowGap),
        }
    })
    const nodes: ChainFlowNode[] = [
        {
            id: MAIN_NODE_ID,
            type: 'chainMain',
            position: graph.positions[MAIN_NODE_ID] ?? defaults[MAIN_NODE_ID]!,
            style: { width: nodeWidth, height: nodeHeight },
            width: nodeWidth,
            height: nodeHeight,
            deletable: false,
            selectable: false,
            ariaLabel: '기본 응답 모델. 연결된 선행 노드의 결과를 받아 응답을 생성합니다.',
            data: {},
        },
    ]
    for (const layer of draft.layers) {
        for (const agent of layer.agents) {
            const id = agentNodeId(agent.id)
            nodes.push({
                id,
                type: 'chainAgent',
                position: graph.positions[id] ?? defaults[id]!,
                style: { width: nodeWidth, height: nodeHeight },
                width: nodeWidth,
                height: nodeHeight,
                dragHandle: '.chain-agent-drag-handle',
                selected: agent.id === selectedAgentId,
                ariaLabel: `${agent.name} 모델 노드`,
                data: {
                    agent,
                    orphan: !connected.has(id),
                    receivesResponse: connected.get(id)?.ancestors.has(MAIN_NODE_ID) ?? false,
                    modelName: models.get(agent.modelPresetId) ?? '모델 프리셋 없음',
                    missingModel: !models.has(agent.modelPresetId),
                },
            })
        }
    }
    return {
        nodes,
        edges: graph.edges.map((edge) => ({
            ...edge,
            type: 'chainConnection',
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--muted-foreground)' },
        })),
    }
}

/** Freeze current positions before changing connections so editing never rearranges other nodes. */
export function saveFlowPositions(
    draft: ModelChainPresetInput,
    nodes: ChainFlowNode[],
): ModelChainPresetInput {
    const graph = getChainGraph(draft)
    const ids = new Set([
        MAIN_NODE_ID,
        ...draft.layers.flatMap((layer) => layer.agents.map((agent) => agentNodeId(agent.id))),
    ])
    return {
        ...draft,
        graph: {
            ...graph,
            positions: {
                ...Object.fromEntries(
                    nodes
                        .filter((node) => ids.has(node.id))
                        .map((node) => [node.id, node.position]),
                ),
                ...graph.positions,
            },
        },
    }
}

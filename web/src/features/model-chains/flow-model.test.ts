import { describe, expect, test } from 'bun:test'

import type { ModelChainPresetInput, ModelPreset } from '@malang/shared'

import { agentNodeId, buildChainFlow, MAIN_NODE_ID, saveFlowPositions } from './flow-model'
import { addNode, connectNodes, newLayer, starterChain } from './model'

const models = [{ id: 'model-a', name: '분석 모델' }] as ModelPreset[]

describe('free graph projection', () => {
    test('renders individual draggable agents with editable edges and a protected main node', () => {
        const draft = starterChain('model-a')
        const before = structuredClone(draft)
        const selected = draft.layers[0]!.agents[0]!
        const graph = buildChainFlow(draft, models, selected.id)
        expect(graph.nodes).toHaveLength(4)
        expect(graph.edges).toHaveLength(3)
        expect(graph.nodes.find((node) => node.id === agentNodeId(selected.id))).toMatchObject({
            type: 'chainAgent',
            selected: true,
            data: { orphan: false, receivesResponse: false, modelName: '분석 모델' },
        })
        expect(graph.nodes.every((node) => !node.parentId && node.draggable !== false)).toBe(true)
        expect(graph.edges.every((edge) => edge.deletable !== false)).toBe(true)
        expect(graph.nodes.find((node) => node.id === MAIN_NODE_ID)?.deletable).toBe(false)
        expect(draft).toEqual(before)
    })

    test('preserves legacy phase ordering and IDs even for interleaved layers', () => {
        const preA = newLayer('pre', 'model-a', 1)
        const preB = newLayer('pre', 'model-a', 2)
        const post = newLayer('post', 'model-a', 1)
        preA.id = preA.agents[0]!.id
        const graph = buildChainFlow(
            { name: 'legacy', description: '', layers: [post, preA, preB] },
            models,
            null,
        )
        expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
            [agentNodeId(preA.agents[0]!.id), agentNodeId(preB.agents[0]!.id)],
            [agentNodeId(preB.agents[0]!.id), MAIN_NODE_ID],
            [MAIN_NODE_ID, agentNodeId(post.agents[0]!.id)],
        ])
        expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(4)
    })

    test('shows disabled agents, orphan status and missing model bindings', () => {
        const draft = addNode(starterChain('model-a'), 'missing')
        const orphan = draft.layers.at(-1)!.agents[0]!
        orphan.enabled = false
        const graph = buildChainFlow(draft, models, null)
        expect(graph.nodes.find((node) => node.id === agentNodeId(orphan.id))?.data).toMatchObject({
            orphan: true,
            agent: { enabled: false },
            missingModel: true,
        })
    })

    test('persists positions and keeps other nodes stationary after connecting an orphan', () => {
        const draft = addNode(starterChain('model-a'), 'model-a')
        const projected = buildChainFlow(draft, models, null)
        const saved = saveFlowPositions(draft, projected.nodes)
        const result = connectNodes(
            saved,
            MAIN_NODE_ID,
            agentNodeId(draft.layers.at(-1)!.agents[0]!.id),
        )
        const reopened = buildChainFlow(JSON.parse(JSON.stringify(result)), models, null)
        expect(reopened.nodes.map((node) => node.position)).toEqual(
            projected.nodes.map((node) => node.position),
        )
        expect(reopened.nodes.at(-1)!.data).toMatchObject({
            orphan: false,
            receivesResponse: true,
        })
    })

    test('keeps an empty graph empty and lays out many orphans without overlaps', () => {
        let draft: ModelChainPresetInput = {
            ...starterChain('model-a'),
            layers: [],
            graph: { edges: [], positions: {} },
        }
        for (let i = 0; i < 32; i++) draft = addNode(draft, 'model-a')
        const graph = buildChainFlow(draft, models, null)
        expect(graph.edges).toEqual([])
        expect(graph.nodes).toHaveLength(33)
        expect(new Set(graph.nodes.map((node) => JSON.stringify(node.position))).size).toBe(33)
    })
})

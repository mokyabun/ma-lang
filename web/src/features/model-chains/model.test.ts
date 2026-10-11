import { describe, expect, test } from 'bun:test'

import {
    getChainGraph,
    planChainExecution,
    type ModelChainPresetInput,
    type ModelChainPreset,
    type ModelPreset,
} from '@malang/shared'

import { agentNodeId, MAIN_NODE_ID } from './flow-model'
import {
    addNode,
    chainInput,
    connectNodes,
    copyChain,
    deleteAgent,
    deleteGraphElements,
    findAgent,
    normalizeImportedChain,
    starterChain,
    totalAgents,
    updateAgent,
    validDraft,
} from './model'

const modelId = '11111111-1111-4111-8111-111111111111'
const models = [{ id: modelId }] as ModelPreset[]

describe('free model chain editing', () => {
    test('adds disconnected nodes, saves them, and detects their response ancestry when connected', () => {
        const original = starterChain(modelId)
        const draft = addNode(original, modelId, { x: -200, y: 500 })
        const agent = draft.layers.at(-1)!.agents[0]!
        expect(totalAgents(original)).toBe(3)
        expect(findAgent(draft, agent.id)?.orphan).toBe(true)
        expect(validDraft(draft)).toBe(true)
        const pre = connectNodes(draft, agentNodeId(agent.id), MAIN_NODE_ID)
        const post = connectNodes(draft, MAIN_NODE_ID, agentNodeId(agent.id))
        expect(findAgent(pre, agent.id)).toMatchObject({
            orphan: false,
            receivesResponse: false,
        })
        expect(findAgent(post, agent.id)).toMatchObject({
            orphan: false,
            receivesResponse: true,
        })
        expect(post.graph?.positions[agentNodeId(agent.id)]).toEqual({ x: -200, y: 500 })
    })

    test('disconnects nodes without deleting their prompts, memory settings or layout', () => {
        let draft = starterChain(modelId)
        const agent = draft.layers[0]!.agents[0]!
        draft = updateAgent(draft, { ...agent, instruction: 'keep this', memoryEnabled: true })
        draft.graph!.positions[agentNodeId(agent.id)] = { x: 12, y: 30 }
        const edge = draft.graph!.edges.find((edge) => edge.source === agentNodeId(agent.id))!
        const result = deleteGraphElements(draft, [], [edge.id])
        expect(findAgent(result, agent.id)).toMatchObject({
            orphan: true,
            agent: { instruction: 'keep this', memoryEnabled: true },
        })
        expect(result.graph?.positions).toEqual(draft.graph!.positions)
        expect(validDraft(result)).toBe(true)
    })

    test('deletes the last agent, removes attached edges and protects main', () => {
        const original = starterChain(modelId)
        const onlyMain = original.layers
            .flatMap((layer) => layer.agents)
            .reduce((draft, agent) => deleteAgent(draft, agent.id), original)
        expect(onlyMain.layers).toEqual([])
        expect(onlyMain.graph?.edges).toEqual([])
        expect(validDraft(onlyMain)).toBe(true)
        expect(onlyMain).toEqual(deleteGraphElements(onlyMain, [MAIN_NODE_ID]))
        expect(original.graph?.edges).toHaveLength(3)
    })

    test('rejects loops, duplicate edges and unknown endpoints without losing edits', () => {
        const draft = starterChain(modelId)
        const pre = agentNodeId(draft.layers[0]!.agents[0]!.id)
        expect(connectNodes(draft, MAIN_NODE_ID, pre)).toBe(draft)
        expect(connectNodes(draft, pre, pre)).toBe(draft)
        expect(connectNodes(draft, pre, MAIN_NODE_ID)).toBe(draft)
        expect(connectNodes(draft, 'missing', MAIN_NODE_ID)).toBe(draft)
    })

    test('reconnects an existing edge atomically', () => {
        const draft = addNode(starterChain(modelId), modelId)
        const added = agentNodeId(draft.layers.at(-1)!.agents[0]!.id)
        const edge = draft.graph!.edges[0]!
        const result = connectNodes(draft, added, edge.target, edge.id)
        expect(result.graph!.edges).toHaveLength(draft.graph!.edges.length)
        expect(result.graph!.edges.find((item) => item.id === edge.id)?.source).toBe(added)
        expect(draft.graph!.edges[0]).toBe(edge)
    })

    test('copies and imports graph references and positions with fresh IDs, including orphans', () => {
        const draft = addNode(starterChain(modelId), modelId, { x: 55, y: 66 })
        const orphan = draft.layers.at(-1)!.agents[0]!
        for (const result of [
            copyChain(draft),
            normalizeImportedChain(JSON.parse(JSON.stringify(draft)), models),
        ]) {
            expect(validDraft(result)).toBe(true)
            expect(result.graph!.edges).toHaveLength(draft.graph!.edges.length)
            const copied = result.layers.at(-1)!.agents[0]!
            expect(copied.id).not.toBe(orphan.id)
            expect(findAgent(result, copied.id)?.orphan).toBe(true)
            expect(result.graph!.positions[agentNodeId(copied.id)]).toEqual({ x: 55, y: 66 })
            result.graph!.positions[agentNodeId(copied.id)]!.x = 999
            expect(draft.graph!.positions[agentNodeId(orphan.id)]!.x).toBe(55)
        }
    })

    test('opens legacy layers as the same execution graph and isolates the draft', () => {
        const { graph: _, ...source } = starterChain(modelId)
        const preset = {
            ...source,
            id: crypto.randomUUID(),
            sortOrder: 0,
            createdAt: '',
            updatedAt: '',
        } as ModelChainPreset
        const draft = chainInput(preset)
        expect(draft.graph).toEqual(getChainGraph(source))
        expect(planChainExecution(draft).batches[0]?.map((node) => node.agent?.id)).toEqual(
            source.layers[0]!.agents.map((agent) => agent.id),
        )
        draft.layers[0]!.agents[0]!.instruction = 'edit'
        expect(preset.layers[0]!.agents[0]!.instruction).not.toBe('edit')
    })

    test('imports legacy model bindings while preserving graph memory settings', () => {
        const draft = starterChain('missing')
        draft.layers[1]!.agents[0]!.memoryEnabled = true
        const result = normalizeImportedChain(draft, models)
        expect(
            result.layers
                .flatMap((layer) => layer.agents)
                .every((agent) => agent.modelPresetId === modelId),
        ).toBe(true)
        expect(result.layers[1]!.agents[0]!.memoryEnabled).toBe(true)
        const { graph: _, ...legacy } = draft
        expect(normalizeImportedChain(legacy, models).layers[1]!.agents[0]!.memoryEnabled).toBe(
            false,
        )
    })

    test('allows 32 independent nodes without the former 12-layer restriction', () => {
        let draft: ModelChainPresetInput = {
            ...starterChain(modelId),
            layers: [],
            graph: { edges: [], positions: {} },
        }
        for (let i = 0; i < 32; i++) draft = addNode(draft, modelId)
        expect(draft.layers).toHaveLength(32)
        expect(validDraft(draft)).toBe(true)
        expect(addNode(draft, modelId)).toBe(draft)
        expect(addNode(draft, '')).toBe(draft)
        expect(validDraft({ ...draft, name: '' })).toBe(false)
    })
})

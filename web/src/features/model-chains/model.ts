import {
    ModelChainPresetInputSchema,
    chainAgentNodeId,
    CHAIN_MAIN_NODE_ID,
    chainGraphError,
    getChainGraph,
    planChainExecution,
    type ModelChainGraph,
    type ModelChainAgent,
    type ModelChainLayer,
    type ModelChainPreset,
    type ModelChainPresetInput,
    type ModelPreset,
} from '@malang/shared'

export type Phase = ModelChainLayer['phase']

export const CHAIN_LIMITS = { agents: 32 } as const

export function addNode(
    draft: ModelChainPresetInput,
    modelPresetId: string,
    position?: { x: number; y: number },
) {
    if (!modelPresetId || totalAgents(draft) >= CHAIN_LIMITS.agents) return draft
    const layer = newLayer('pre', modelPresetId, totalAgents(draft) + 1)
    layer.agents[0]!.name = `모델 노드 ${totalAgents(draft) + 1}`
    const graph = getChainGraph(draft)
    return {
        ...draft,
        layers: [...draft.layers, layer],
        graph: {
            ...graph,
            positions: {
                ...graph.positions,
                ...(position ? { [chainAgentNodeId(layer.agents[0]!.id)]: position } : {}),
            },
        },
    }
}

export function connectNodes(
    draft: ModelChainPresetInput,
    source: string,
    target: string,
    replaceEdgeId?: string,
) {
    const graph = getChainGraph(draft)
    const next = {
        ...draft,
        graph: {
            ...graph,
            edges: [
                ...graph.edges.filter((edge) => edge.id !== replaceEdgeId),
                { id: replaceEdgeId ?? crypto.randomUUID(), source, target },
            ],
        },
    }
    return chainGraphError(next) ? draft : next
}

export function deleteGraphElements(
    draft: ModelChainPresetInput,
    nodeIds: string[],
    edgeIds: string[] = [],
) {
    const removed = new Set(nodeIds.filter((id) => id !== CHAIN_MAIN_NODE_ID))
    const graph = getChainGraph(draft)
    return {
        ...draft,
        layers: draft.layers
            .map((layer) => ({
                ...layer,
                agents: layer.agents.filter((agent) => !removed.has(chainAgentNodeId(agent.id))),
            }))
            .filter((layer) => layer.agents.length),
        graph: {
            edges: graph.edges.filter(
                (edge) =>
                    !removed.has(edge.source) &&
                    !removed.has(edge.target) &&
                    !edgeIds.includes(edge.id),
            ),
            positions: Object.fromEntries(
                Object.entries(graph.positions).filter(([id]) => !removed.has(id)),
            ),
        },
    }
}

export function newLayer(phase: Phase, modelPresetId: string, index: number): ModelChainLayer {
    return {
        id: crypto.randomUUID(),
        name: `모델 노드 ${index}`,
        phase,
        agents: [newAgent(phase, modelPresetId, 1)],
    }
}

export function newAgent(_phase: Phase, modelPresetId: string, index: number): ModelChainAgent {
    return {
        id: crypto.randomUUID(),
        name: `모델 노드 ${index}`,
        modelPresetId,
        systemPrompt: '',
        instruction: '',
        enabled: true,
        postMode: 'replace',
        assistantPrefill: false,
        includeSettingInfo: true,
        includeGlobalNote: false,
        includeLongTermMemory: true,
        includeRecentChat: true,
        includeCurrentUserInput: true,
        includePreviousNotes: true,
        memoryEnabled: false,
        memoryInstruction: '',
        memoryFormat: '',
    }
}

export function starterChain(modelPresetId: string): ModelChainPresetInput {
    const analysis = newLayer('pre', modelPresetId, 1)
    analysis.name = '장면 분석'
    analysis.agents = [
        {
            ...newAgent('pre', modelPresetId, 1),
            name: '맥락과 세계관',
            systemPrompt: '당신은 장면과 세계관의 연속성을 분석하는 에이전트입니다.',
            instruction: '이번 응답에서 반드시 유지할 사실과 제약을 간결하게 정리하세요.',
        },
        {
            ...newAgent('pre', modelPresetId, 2),
            name: '인물 심리와 의도',
            systemPrompt:
                '당신은 현재 장면에 등장하는 인물의 심리와 의도를 분석하는 에이전트입니다.',
            instruction: '현재 유저 입력에 대한 인물별 감정, 의도와 행동 제약을 정리하세요.',
        },
    ]
    const polish = newLayer('post', modelPresetId, 1)
    polish.name = '최종 검수'
    polish.agents[0] = {
        ...polish.agents[0]!,
        name: '문체와 설정 검수',
        systemPrompt: '당신은 메인 응답을 설정과 문체에 맞게 다듬는 편집 에이전트입니다.',
        instruction: '설정 충돌과 반복을 고치고 사용자에게 보일 최종 응답만 출력하세요.',
    }
    const draft = {
        name: '새 모델 파이프라인',
        description: '장면을 병렬 분석한 뒤 메인 응답을 최종 검수합니다.',
        layers: [analysis, polish],
    }
    return { ...draft, graph: getChainGraph(draft) }
}

export function chainInput(preset: ModelChainPreset): ModelChainPresetInput {
    return structuredClone({
        name: preset.name,
        description: preset.description,
        layers: preset.layers,
        graph: getChainGraph(preset),
    })
}

function reidentifyChain(source: ModelChainPresetInput): ModelChainPresetInput {
    const ids = new Map<string, string>([[CHAIN_MAIN_NODE_ID, CHAIN_MAIN_NODE_ID]])
    const layers = source.layers.map((layer) => ({
        ...layer,
        id: crypto.randomUUID(),
        agents: layer.agents.map((agent) => {
            const id = crypto.randomUUID()
            ids.set(chainAgentNodeId(agent.id), chainAgentNodeId(id))
            return { ...agent, id }
        }),
    }))
    const graph = getChainGraph(source)
    const remapped: ModelChainGraph = {
        edges: graph.edges.map((edge) => ({
            id: crypto.randomUUID(),
            source: ids.get(edge.source) ?? edge.source,
            target: ids.get(edge.target) ?? edge.target,
        })),
        positions: Object.fromEntries(
            Object.entries(graph.positions).map(([id, position]) => [
                ids.get(id) ?? id,
                { ...position },
            ]),
        ),
    }
    return { ...source, layers, graph: remapped }
}

export function copyChain(source: ModelChainPresetInput): ModelChainPresetInput {
    return reidentifyChain({ ...source, name: `${source.name} 복사본` })
}

export function firstAgent(draft: ModelChainPresetInput) {
    return draft.layers.flatMap((layer) => layer.agents)[0]
}

export function totalAgents(draft: ModelChainPresetInput) {
    return draft.layers.reduce((sum, layer) => sum + layer.agents.length, 0)
}

export function findAgent(draft: ModelChainPresetInput, id: string | null) {
    const plan = planChainExecution(draft)
    for (const layer of draft.layers) {
        const agent = layer.agents.find((item) => item.id === id)
        if (!agent) continue
        const nodeId = chainAgentNodeId(agent.id)
        const node = plan.nodes.find((node) => node.id === nodeId)
        const orphan = plan.orphans.some((node) => node.id === nodeId)
        return {
            receivesResponse: node?.ancestors.has(CHAIN_MAIN_NODE_ID) ?? false,
            agent,
            orphan,
        }
    }
    return null
}

export function updateAgent(
    draft: ModelChainPresetInput,
    agent: ModelChainAgent,
): ModelChainPresetInput {
    return {
        ...draft,
        layers: draft.layers.map((layer) => ({
            ...layer,
            agents: layer.agents.map((item) => (item.id === agent.id ? agent : item)),
        })),
    }
}

export function deleteAgent(
    draft: ModelChainPresetInput,
    agentId: string | null,
): ModelChainPresetInput {
    return agentId ? deleteGraphElements(draft, [chainAgentNodeId(agentId)]) : draft
}

export function validDraft(draft: ModelChainPresetInput) {
    return Boolean(draft.name.trim()) && ModelChainPresetInputSchema.safeParse(draft).success
}

export function postModeLabel(mode: ModelChainAgent['postMode']) {
    if (mode === 'append') return '뒤에 추가'
    if (mode === 'prepend') return '앞에 추가'
    return '대체'
}

export function normalizeImportedChain(
    value: unknown,
    modelPresets: ModelPreset[],
): ModelChainPresetInput {
    if (!value || typeof value !== 'object') throw new Error('올바른 모델 체인 JSON이 아닙니다.')
    const source = value as Partial<ModelChainPresetInput>
    if (!Array.isArray(source.layers) || (!source.layers.length && !source.graph))
        throw new Error('레이어가 없는 모델 체인입니다.')
    const available = new Set(modelPresets.map((preset) => preset.id))
    const fallback = modelPresets[0]?.id
    if (!fallback) throw new Error('먼저 모델 프리셋을 만들어 주세요.')
    const normalized: ModelChainPresetInput = {
        name: String(source.name || '가져온 모델 파이프라인'),
        description: String(source.description || ''),
        ...(source.graph ? { graph: source.graph } : {}),
        layers: source.layers
            .map((layer, layerIndex): ModelChainLayer => ({
                id: layer.id || crypto.randomUUID(),
                name: String(layer.name || `레이어 ${layerIndex + 1}`),
                phase: layer.phase === 'post' ? 'post' : 'pre',
                agents: (Array.isArray(layer.agents) ? layer.agents : []).map(
                    (agent, agentIndex) => ({
                        ...newAgent(
                            layer.phase === 'post' ? 'post' : 'pre',
                            available.has(agent.modelPresetId) ? agent.modelPresetId : fallback,
                            agentIndex + 1,
                        ),
                        ...agent,
                        id: agent.id || crypto.randomUUID(),
                        modelPresetId: available.has(agent.modelPresetId)
                            ? agent.modelPresetId
                            : fallback,
                        memoryEnabled:
                            !source.graph && layer.phase === 'post'
                                ? false
                                : agent.memoryEnabled === true,
                    }),
                ),
            }))
            .filter((layer) => layer.agents.length),
    }
    if (!validDraft(normalized))
        throw new Error(
            '체인 형식과 연결을 확인해 주세요. 최대 32개 모델 노드를 저장할 수 있습니다.',
        )
    return reidentifyChain(normalized)
}

export function safeFilename(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'model-chain'
}

export function errorText(cause: unknown, fallback: string) {
    return cause instanceof Error ? cause.message : fallback
}

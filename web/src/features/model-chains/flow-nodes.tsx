import { DotsSix, FlowArrow } from '@phosphor-icons/react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { createContext, useContext } from 'react'

import { cn } from '@/lib/utils'

import type { AgentFlowNode, MainFlowNode } from './flow-model'
import { postModeLabel } from './model'

export const FlowActionsContext = createContext<{
    onSelect: (agentId: string) => void
    onDisconnect: (edgeId: string) => void
    disabled: boolean
} | null>(null)

function ExecutionHandles() {
    return (
        <>
            <Handle type="target" position={Position.Left} aria-label="입력 연결" />
            <Handle type="source" position={Position.Right} aria-label="출력 연결" />
        </>
    )
}

export function ChainAgentNode({ data, selected }: NodeProps<AgentFlowNode>) {
    const { agent, orphan, receivesResponse, modelName, missingModel } = data
    const actions = useContext(FlowActionsContext)
    return (
        <div
            className={cn(
                'flex h-full w-full flex-col rounded-md border border-border bg-card shadow-xs',
                selected && 'border-primary ring-2 ring-primary/25',
                (!agent.enabled || orphan) && 'border-dashed',
            )}
        >
            <ExecutionHandles />
            <div className="chain-agent-drag-handle flex h-8 shrink-0 cursor-grab items-center justify-between border-b border-border/65 px-3 text-[10px] text-muted-foreground active:cursor-grabbing">
                <span className="flex items-center gap-1">
                    <DotsSix className="size-4" />
                    {orphan ? '고아 노드 · 실행 제외' : '모델 노드'}
                </span>
                <span>{agent.enabled ? '활성' : '꺼짐'}</span>
            </div>
            <button
                type="button"
                onClick={() => actions?.onSelect(agent.id)}
                aria-pressed={selected}
                aria-label={`${agent.name} 에이전트 편집`}
                className="nodrag nopan flex min-h-0 flex-1 flex-col p-3 text-left outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
            >
                <strong className="w-full truncate text-sm font-semibold">
                    {agent.name || '이름 없는 노드'}
                </strong>
                <span
                    className={cn(
                        'mt-1 w-full truncate text-xs',
                        missingModel ? 'text-destructive' : 'text-muted-foreground',
                    )}
                    title={modelName}
                >
                    {modelName}
                </span>
                <span className="mt-auto text-[10px] text-muted-foreground">
                    {orphan
                        ? '기본 응답 모델과 이어지면 실행됩니다'
                        : receivesResponse
                          ? `응답 ${postModeLabel(agent.postMode)}`
                          : agent.memoryEnabled
                            ? '결과 전달 · 기억 사용'
                            : '다음 노드에 결과 전달'}
                </span>
            </button>
        </div>
    )
}

export function ChainMainNode(_props: NodeProps<MainFlowNode>) {
    return (
        <div className="flex h-full cursor-grab flex-col items-center justify-center rounded-lg border border-primary/50 bg-card px-5 text-center active:cursor-grabbing">
            <ExecutionHandles />
            <span className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                <FlowArrow className="size-4" aria-hidden="true" /> MAIN RESPONSE
            </span>
            <strong className="font-serif text-base">기본 응답 모델</strong>
            <span className="mt-1 text-xs text-muted-foreground">
                채팅에서 선택한 모델로 응답 생성
            </span>
        </div>
    )
}

export const chainNodeTypes = { chainAgent: ChainAgentNode, chainMain: ChainMainNode }

import { planChainExecution, type ModelChainPresetInput } from '@malang/shared'

import { Badge } from '@/components/ui/badge'

export function PipelineSummary({ preset }: { preset: ModelChainPresetInput }) {
    const plan = planChainExecution(preset)
    const active = plan.nodes.filter((node) => node.agent.enabled).length
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono text-[9px]">
                실행 노드 {active}개
            </Badge>
            <Badge variant="outline" className="font-mono text-[9px]">
                기본 응답
            </Badge>
            {plan.orphans.length ? (
                <Badge variant="outline" className="font-mono text-[9px]">
                    고아 {plan.orphans.length}개
                </Badge>
            ) : null}
        </span>
    )
}

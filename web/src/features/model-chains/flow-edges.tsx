import { Scissors } from '@phosphor-icons/react'
import { BaseEdge, EdgeToolbar, getSmoothStepPath, useStore, type EdgeProps } from '@xyflow/react'
import { useContext } from 'react'

import { Button } from '@/components/ui/button'

import { FlowActionsContext } from './flow-nodes'

function ChainConnectionEdge(props: EdgeProps) {
    const actions = useContext(FlowActionsContext)
    const zoom = useStore((state) => state.transform[2])
    const [path, x, y] = getSmoothStepPath(props)
    return (
        <>
            <BaseEdge
                id={props.id}
                path={path}
                markerEnd={props.markerEnd}
                interactionWidth={28 / zoom}
            />
            <EdgeToolbar
                edgeId={props.id}
                x={x}
                y={y}
                isVisible={props.selected}
                className="nodrag nopan"
            >
                <Button
                    size="xs"
                    variant="outline"
                    className="border-primary bg-card text-foreground shadow-md"
                    disabled={!actions || actions.disabled}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation()
                        actions?.onDisconnect(props.id)
                    }}
                >
                    <Scissors /> 연결 끊기
                </Button>
            </EdgeToolbar>
        </>
    )
}

export const chainEdgeTypes = { chainConnection: ChainConnectionEdge }

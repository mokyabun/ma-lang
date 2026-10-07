import type { IllustrationCount, Message } from '@malang/shared'
import { ImageSquare, WarningCircle } from '@phosphor-icons/react'
import { useAtomValue, useSetAtom } from 'jotai'

import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'

import { messagePlansAtom, requestIllustrationAtom } from './illustration-atom'

const QUICK_COUNTS = [1, 2, 3, 4]

/** Starts an illustration plan for one assistant message, optionally with a one-off count. */
export function MessageIllustrationTool({
    conversationId,
    message,
}: {
    conversationId: string
    message: Message
}) {
    const plan = useAtomValue(messagePlansAtom)[message.id]
    const request = useSetAtom(requestIllustrationAtom)
    const running = plan?.status === 'running'

    function start(count?: IllustrationCount) {
        void request({ conversationId, messageId: message.id, count })
    }

    return (
        <>
            {plan?.status === 'failed' ? (
                <span
                    className="mr-auto flex min-w-0 items-center gap-1 text-[11px] text-destructive"
                    title={plan.error ?? undefined}
                >
                    <WarningCircle aria-hidden="true" />
                    <span className="truncate">삽화 분석 실패</span>
                </span>
            ) : running ? (
                <span className="mr-auto flex items-center gap-1.5 text-[11px]">
                    <Spinner className="size-3" /> 삽화 장면을 고르는 중
                </span>
            ) : null}
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={running || message.status !== 'complete'}
                            aria-label="삽화 생성"
                            title="삽화 생성"
                        />
                    }
                >
                    <ImageSquare />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => start()}>
                        <ImageSquare aria-hidden="true" /> 대화 설정대로 생성
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {QUICK_COUNTS.map((count) => (
                        <DropdownMenuItem
                            key={count}
                            onClick={() => start({ min: count, max: count })}
                        >
                            {count}장 생성
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    )
}

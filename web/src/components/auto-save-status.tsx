import { Check, CircleNotch, CloudArrowUp, WarningCircle } from '@phosphor-icons/react'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'

import { autoSaveStatusAtom, type AutoSaveReport } from '@/lib/auto-save-state'
import { cn } from '@/lib/utils'

export function GlobalAutoSaveStatus() {
    const status = useAtomValue(autoSaveStatusAtom)
    const [leavingStatus, setLeavingStatus] = useState<AutoSaveReport | null>(null)
    const [dismissedStatus, setDismissedStatus] = useState<AutoSaveReport | null>(null)

    useEffect(() => {
        if (!status || (status.state !== 'saved' && status.state !== 'error')) return

        let removeTimer: ReturnType<typeof setTimeout> | undefined
        const dismissTimer = setTimeout(
            () => {
                setLeavingStatus(status)
                removeTimer = setTimeout(() => setDismissedStatus(status), 160)
            },
            status.state === 'saved' ? 2500 : 6000,
        )

        return () => {
            clearTimeout(dismissTimer)
            if (removeTimer) clearTimeout(removeTimer)
        }
    }, [status])

    if (!status || status.state === 'idle' || dismissedStatus === status) return null
    const { state, error } = status
    const isLeaving = leavingStatus === status
    const content = {
        idle: { icon: Check, label: '자동 저장됨' },
        pending: { icon: CloudArrowUp, label: '변경 감지' },
        saving: { icon: CircleNotch, label: '저장 중…' },
        saved: { icon: Check, label: '자동 저장됨' },
        error: { icon: WarningCircle, label: error || '자동 저장 실패' },
    }[state]
    const Icon = content.icon

    return (
        <span
            className={cn(
                'fixed right-4 bottom-4 z-[100] grid size-9 place-items-center rounded-full bg-popover text-muted-foreground shadow-xl ring-1 ring-foreground/10',
                'motion-reduce:animate-none',
                isLeaving
                    ? 'animate-out fade-out-0 slide-out-to-bottom-2 duration-150'
                    : 'animate-in fade-in-0 slide-in-from-bottom-2 zoom-in-95 duration-150',
                state === 'pending' && 'text-primary',
                state === 'saving' && 'text-primary [&_svg]:animate-spin',
                state === 'error' && 'text-destructive',
            )}
            title={content.label}
            aria-label={content.label}
            role={state === 'error' ? 'alert' : 'status'}
        >
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">{content.label}</span>
        </span>
    )
}

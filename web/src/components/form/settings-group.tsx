import { CaretRight } from '@phosphor-icons/react'
import type { ComponentProps, ReactNode } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

type SettingsGroupProps = Omit<ComponentProps<typeof Collapsible>, 'children'> & {
    title: ReactNode
    meta?: ReactNode
    actions?: ReactNode
    triggerClassName?: string
    contentClassName?: string
    children: ReactNode
}

export function SettingsGroup({
    title,
    meta,
    actions,
    className,
    triggerClassName,
    contentClassName,
    children,
    ...props
}: SettingsGroupProps) {
    return (
        <Collapsible
            className={cn(
                'overflow-hidden rounded-lg border border-border bg-card/50 text-card-foreground',
                className,
            )}
            {...props}
        >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch">
                <CollapsibleTrigger
                    className={cn(
                        'grid min-h-11 w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2 bg-transparent px-3 py-2 text-left text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring [&[data-panel-open]]:text-foreground [&[data-panel-open]_.settings-group-caret]:rotate-90',
                        triggerClassName,
                    )}
                >
                    <CaretRight
                        className="settings-group-caret size-3.5 transition-transform"
                        aria-hidden="true"
                    />
                    <span className="min-w-0 truncate text-sm font-medium tracking-normal">
                        {title}
                    </span>
                    {meta !== undefined ? (
                        <span className="font-mono text-[10px] font-normal tabular-nums text-muted-foreground">
                            {meta}
                        </span>
                    ) : null}
                </CollapsibleTrigger>
                {actions ? (
                    <div className="flex items-center gap-1 border-l border-border px-2">
                        {actions}
                    </div>
                ) : null}
            </div>
            <CollapsibleContent
                className={cn(
                    'border-t border-border bg-transparent p-3 data-closed:hidden',
                    contentClassName,
                )}
            >
                {children}
            </CollapsibleContent>
        </Collapsible>
    )
}

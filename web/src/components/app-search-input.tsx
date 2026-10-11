import { MagnifyingGlass } from '@phosphor-icons/react'
import type { ComponentProps } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function AppSearchInput({
    label,
    className,
    inputClassName,
    ...props
}: Omit<ComponentProps<typeof Input>, 'className'> & {
    label: string
    className?: string
    inputClassName?: string
}) {
    return (
        <Label
            data-slot="app-search-input"
            className={cn(
                'flex h-10 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-muted-foreground transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50',
                className,
            )}
        >
            <MagnifyingGlass aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">{label}</span>
            <Input
                aria-label={label}
                className={cn(
                    'h-auto border-0 bg-transparent p-0 shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent',
                    inputClassName,
                )}
                {...props}
            />
        </Label>
    )
}

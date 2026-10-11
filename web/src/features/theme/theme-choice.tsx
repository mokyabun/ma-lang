import { Moon } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'

export function ThemeChoice({
    active,
    icon: Icon,
    label,
    description,
    swatches,
    onClick,
}: {
    active: boolean
    icon: typeof Moon
    label: string
    description: string
    swatches: [string, string, string]
    onClick: () => void
}) {
    return (
        <button
            type="button"
            className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border bg-card/30 p-4 text-left outline-none transition-colors hover:bg-muted/45 focus-visible:ring-1 focus-visible:ring-ring',
                active ? 'border-foreground/45 bg-selection' : 'border-border',
            )}
            aria-pressed={active}
            onClick={onClick}
        >
            <span className="grid size-9 place-items-center border border-border bg-background text-muted-foreground">
                <Icon aria-hidden="true" />
            </span>
            <span className="min-w-0">
                <strong className="block text-sm">{label}</strong>
                <small className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                    {description}
                </small>
            </span>
            <span className="flex" aria-hidden="true">
                {swatches.map((swatch, index) => (
                    <span
                        key={swatch}
                        className={cn('size-4 border border-black/10', index > 0 && '-ml-1')}
                        style={{ backgroundColor: swatch }}
                    />
                ))}
            </span>
        </button>
    )
}

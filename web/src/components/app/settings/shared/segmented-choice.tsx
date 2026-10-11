import { cn } from '@/lib/utils'

export function SegmentedChoice({
    value,
    options,
    onChange,
}: {
    value: string
    options: Array<{ value: string; label: string }>
    onChange: (value: string) => void
}) {
    return (
        <div className="inline-flex rounded-md border border-input bg-background p-0.5">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={cn(
                        'rounded-sm px-3 py-1.5 text-[11px] text-muted-foreground transition-colors',
                        value === option.value && 'bg-primary text-primary-foreground',
                    )}
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

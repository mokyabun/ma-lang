export function RangeSetting({
    id,
    label,
    value,
    min,
    max,
    step,
    valueLabel,
    edgeLabels,
    onChange,
}: {
    id: string
    label: string
    value: number
    min: number
    max: number
    step: number
    valueLabel: string
    edgeLabels: [string, string]
    onChange: (value: number) => void
}) {
    const progress = ((value - min) / (max - min)) * 100

    return (
        <div>
            <div className="mb-3 flex items-center justify-between gap-4">
                <label htmlFor={id} className="text-xs font-medium">
                    {label}
                </label>
                <output
                    htmlFor={id}
                    className="min-w-16 border border-border bg-background px-2 py-1 text-center font-mono text-[10px] tabular-nums"
                >
                    {valueLabel}
                </output>
            </div>
            <input
                id={id}
                type="range"
                className="malang-theme-range"
                min={min}
                max={max}
                step={step}
                value={value}
                style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
                onInput={(event) => onChange(Number(event.currentTarget.value))}
            />
            <div className="mt-2 flex justify-between font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                <span>{edgeLabels[0]}</span>
                <span>{edgeLabels[1]}</span>
            </div>
        </div>
    )
}

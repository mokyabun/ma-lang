import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export function ParameterRow({
    label,
    description,
    value,
    defaultValue,
    min,
    max,
    step,
    integer = false,
    onChange,
    onEnabledChange,
}: {
    label: string
    description: string
    value: number | undefined
    defaultValue: number
    min: number
    max: number
    step: number
    integer?: boolean
    onChange: (value: string) => void
    onEnabledChange: (enabled: boolean) => void
}) {
    const enabled = value !== undefined
    const displayedValue = value ?? defaultValue

    return (
        <div className={cn('py-5', !enabled && 'opacity-65')}>
            <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{label}</h3>
                    <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">
                        {description}
                    </p>
                </div>
                <Switch
                    checked={enabled}
                    onCheckedChange={onEnabledChange}
                    aria-label={`${label} ${enabled ? '비활성화' : '활성화'}`}
                />
            </div>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-4">
                <input
                    className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
                    type="range"
                    value={displayedValue}
                    min={min}
                    max={max}
                    step={step}
                    disabled={!enabled}
                    aria-label={`${label} 슬라이더`}
                    onChange={(event) => onChange(event.target.value)}
                />
                <Input
                    type="number"
                    value={displayedValue}
                    min={min}
                    max={max}
                    step={integer ? 1 : step}
                    disabled={!enabled}
                    aria-label={`${label} 값`}
                    className="text-right font-mono tabular-nums"
                    onChange={(event) => onChange(event.target.value)}
                />
            </div>
        </div>
    )
}

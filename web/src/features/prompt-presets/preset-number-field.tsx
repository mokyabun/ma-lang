import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PresetNumberField({
    label,
    value,
    fallback,
    min,
    max,
    step,
    onChange,
}: {
    label: string
    value: number | undefined
    fallback?: number
    min?: number
    max?: number
    step?: string
    onChange: (value: string) => void
}) {
    return (
        <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
            {label}
            <Input
                type="number"
                value={value ?? fallback ?? ''}
                min={min}
                max={max}
                step={step}
                onChange={(event) => onChange(event.target.value)}
            />
        </Label>
    )
}

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export function PresetCheck({
    label,
    checked,
    onChange,
}: {
    label: string
    checked: boolean
    onChange: (checked: boolean) => void
}) {
    return (
        <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
            <Checkbox checked={checked} onCheckedChange={(checked) => onChange(checked)} />
            <span>{label}</span>
        </Label>
    )
}

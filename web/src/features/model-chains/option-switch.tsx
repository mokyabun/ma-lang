import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function OptionSwitch({
    label,
    detail,
    checked,
    onCheckedChange,
}: {
    label: string
    detail?: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
}) {
    return (
        <Label className="flex items-start justify-between gap-4 py-1 text-xs">
            <span>
                <strong className="block font-medium text-foreground">{label}</strong>
                {detail ? (
                    <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                        {detail}
                    </span>
                ) : null}
            </span>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </Label>
    )
}

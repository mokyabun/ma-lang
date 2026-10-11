import { Label } from '@/components/ui/label'

export function Field({
    label,
    description,
    children,
}: {
    label: string
    description?: string
    children: React.ReactNode
}) {
    return (
        <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
            {label}
            {description ? (
                <span className="text-[10px] font-normal leading-5 text-muted-foreground">
                    {description}
                </span>
            ) : null}
            {children}
        </Label>
    )
}

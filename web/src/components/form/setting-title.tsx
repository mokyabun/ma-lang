export function SettingTitle({ title, description }: { title: string; description: string }) {
    return (
        <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
        </div>
    )
}

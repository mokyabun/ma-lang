import { PencilSimple } from '@phosphor-icons/react'

export function CatalogGroup({
    title,
    items,
    actions,
    empty,
    onSelect,
}: {
    title: string
    items: Array<{ id: string; title: string; detail: string; badge?: string }>
    actions: React.ReactNode
    empty: React.ReactNode
    onSelect: (id: string) => void
}) {
    return (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                    <p className="text-sm font-medium">{title}</p>
                </div>
                {actions}
            </div>
            {items.length ? (
                <div className="divide-y divide-border">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                            onClick={() => onSelect(item.id)}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                    <strong className="truncate text-sm font-medium">
                                        {item.title}
                                    </strong>
                                    {item.badge ? (
                                        <span className="shrink-0 text-[9px] font-medium text-primary">
                                            {item.badge}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
                                    {item.detail}
                                </span>
                            </span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
                                <PencilSimple aria-hidden="true" /> 변경
                            </span>
                        </button>
                    ))}
                </div>
            ) : (
                empty
            )}
        </section>
    )
}

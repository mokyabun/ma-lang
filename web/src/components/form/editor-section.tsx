import { Plus } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'

export function EditorSection({
    title,
    count,
    onAdd,
    children,
}: {
    title: string
    count: number
    onAdd: () => void
    children: React.ReactNode
}) {
    return (
        <section className="[&>header]:flex [&>header]:min-h-12 [&>header]:items-center [&>header]:justify-between [&>header_h3]:font-mono [&>header_h3]:text-[10px] [&>header_h3]:tracking-wider [&>header_h3_span]:text-primary">
            <header>
                <h3>
                    {title} <span>{count}</span>
                </h3>
                <Button variant="ghost" onClick={onAdd}>
                    <Plus /> 추가
                </Button>
            </header>
            <div>{children}</div>
        </section>
    )
}

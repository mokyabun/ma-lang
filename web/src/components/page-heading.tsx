import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
    eyebrow: string
    title: string
    description?: string
    actions?: ReactNode
    className?: string
    titleId?: string
}

export function PageHeader({
    eyebrow,
    title,
    description,
    actions,
    className,
    titleId,
}: PageHeaderProps) {
    return (
        <header
            className={cn(
                'flex items-end justify-between gap-6 border-b border-border pb-7 max-sm:flex-col max-sm:items-stretch',
                className,
            )}
        >
            <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {eyebrow}
                </p>
                <h1
                    id={titleId}
                    className="mt-2 text-balance font-serif text-4xl leading-tight text-foreground sm:text-5xl"
                >
                    {title}
                </h1>
                {description ? (
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </header>
    )
}

interface SectionHeadingProps {
    title: string
    description?: string
    index?: string
    actions?: ReactNode
    className?: string
}

export function SectionHeading({
    title,
    description,
    index,
    actions,
    className,
}: SectionHeadingProps) {
    return (
        <header
            className={cn(
                'flex items-start justify-between gap-6 border-b border-border pb-5 max-sm:flex-col',
                className,
            )}
        >
            <div className="min-w-0">
                {index ? (
                    <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-primary">
                        {index}
                    </span>
                ) : null}
                <h2 className="mt-1 font-serif text-2xl leading-tight text-foreground sm:text-3xl">
                    {title}
                </h2>
                {description ? (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </header>
    )
}

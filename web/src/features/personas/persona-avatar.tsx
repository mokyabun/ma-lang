import type { Persona } from '@malang/shared'
import { useState } from 'react'

import { assetUrl } from '@/lib/api'
import { initials } from '@/lib/text'
import { cn } from '@/lib/utils'

export function PersonaAvatar({
    persona,
    fallbackName,
    className,
}: {
    persona: Persona | null
    fallbackName?: string
    className?: string
}) {
    const [failedAssetId, setFailedAssetId] = useState<string | null>(null)
    const name = persona?.name || fallbackName || '?'
    return (
        <span
            className={cn(
                'avatar grid size-full place-items-center overflow-hidden rounded-md bg-secondary font-serif text-xs font-semibold text-secondary-foreground [&_img]:size-full [&_img]:object-cover',
                className,
            )}
        >
            {persona?.avatarAssetId && failedAssetId !== persona.avatarAssetId ? (
                <img
                    src={assetUrl(persona.avatarAssetId)}
                    alt=""
                    onError={() => setFailedAssetId(persona.avatarAssetId)}
                />
            ) : (
                <span>{initials(name)}</span>
            )}
        </span>
    )
}

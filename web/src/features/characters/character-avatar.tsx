import { GENERAL_CHAT_CHARACTER_ID, type Character } from '@malang/shared'
import { ChatsCircle, UserFocus } from '@phosphor-icons/react'
import { useState } from 'react'

import { assetUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

export function CharacterAvatar({
    character,
    className,
}: {
    character: Character
    className?: string
}) {
    const [failedAssetId, setFailedAssetId] = useState<string | null>(null)
    return (
        <span
            className={cn(
                'avatar grid size-full place-items-center overflow-hidden rounded-md bg-secondary font-serif text-xs font-semibold text-secondary-foreground [&_img]:size-full [&_img]:object-cover',
                className,
            )}
        >
            {character.id === GENERAL_CHAT_CHARACTER_ID ? (
                <ChatsCircle
                    className="size-[55%] text-primary"
                    aria-hidden="true"
                    weight="duotone"
                />
            ) : character.avatarAssetId && failedAssetId !== character.avatarAssetId ? (
                <img
                    src={assetUrl(character.avatarAssetId)}
                    alt=""
                    onError={() => setFailedAssetId(character.avatarAssetId)}
                />
            ) : (
                <UserFocus
                    className="size-[58%] text-secondary-foreground/70"
                    aria-hidden="true"
                    weight="duotone"
                />
            )}
        </span>
    )
}

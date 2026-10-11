import type { Character, Conversation, ModelPreset } from '@malang/shared'
import { CloudCheck, Info } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { CharacterAvatar } from '@/features/characters/character-avatar'
import { cn } from '@/lib/utils'

export function ChatHeader({
    character,
    conversation,
    modelPreset,
    busy,
    onToggleInspector,
}: {
    character: Character
    conversation: Conversation
    modelPreset: ModelPreset | null
    busy: boolean
    onToggleInspector: () => void
}) {
    return (
        <header className="z-10 flex min-w-0 items-center gap-3 overflow-hidden border-b border-border bg-background/90 px-5 backdrop-blur-md sm:px-7 max-sm:gap-2 max-sm:px-3 [&>.avatar]:size-9 [&>.avatar]:shrink-0 max-sm:[&>.avatar]:size-8">
            <span className="hidden size-[2.75rem] shrink-0 max-[820px]:block" aria-hidden="true" />
            <CharacterAvatar character={character} />
            <div className="min-w-0 flex-1 [&_h2]:truncate [&_h2]:font-serif [&_h2]:text-base [&_h2]:font-medium max-sm:[&_h2]:text-sm [&_span]:block [&_span]:truncate [&_span]:font-mono [&_span]:text-[8px] [&_span]:tracking-wider [&_span]:text-muted-foreground">
                <span>{character.name.toUpperCase()}</span>
                <h2>{conversation.title}</h2>
            </div>
            <div
                className={cn(
                    'flex max-w-56 items-center gap-2 truncate rounded-full border border-border px-2.5 py-1.5 font-mono text-[9px] text-muted-foreground max-sm:hidden',
                    busy && 'border-primary/30 text-primary',
                )}
            >
                {busy ? (
                    <span className="size-2 animate-pulse rounded-full bg-primary" />
                ) : (
                    <CloudCheck aria-hidden="true" />
                )}
                {busy ? '서버에서 작성 중' : modelPreset?.name || '모델 미연결'}
            </div>
            <Button
                size="icon"
                variant="ghost"
                className="ml-1 text-muted-foreground"
                onClick={onToggleInspector}
                aria-label="대화 설정 열기"
            >
                <Info aria-hidden="true" />
            </Button>
        </header>
    )
}

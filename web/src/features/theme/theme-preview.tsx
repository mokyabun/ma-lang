import { Palette } from '@phosphor-icons/react'

import { CHAT_APPEARANCE_LIMITS } from '@/components/theme-preferences'

export function ThemePreview({ fontSize, maxWidth }: { fontSize: number; maxWidth: number }) {
    const normalizedWidth =
        (maxWidth - CHAT_APPEARANCE_LIMITS.maxWidth.min) /
        (CHAT_APPEARANCE_LIMITS.maxWidth.max - CHAT_APPEARANCE_LIMITS.maxWidth.min)
    const previewWidth = 72 + normalizedWidth * 28

    return (
        <div className="overflow-hidden border border-border bg-background p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Palette aria-hidden="true" /> 미리보기
                </div>
                <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                    {fontSize}px · {maxWidth}px
                </span>
            </div>
            <article
                className="ml-auto border border-border/70 bg-card p-5 shadow-sm transition-[width]"
                style={{ width: `${previewWidth}%` }}
            >
                <header className="mb-4 flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-xs font-semibold text-secondary-foreground">
                        M
                    </span>
                    <div>
                        <strong className="block text-sm">Prism Heart</strong>
                        <small className="text-[9px] text-muted-foreground">캐릭터</small>
                    </div>
                </header>
                <div style={{ fontSize, lineHeight: 1.8 }}>
                    <p>새로운 장면이 조용히 시작됩니다.</p>
                    <blockquote className="mt-3 border-l-[3px] border-[oklch(0.8_0.16_80)] bg-muted/35 px-3 py-2 font-medium text-[oklch(0.72_0.16_75)] dark:text-[oklch(0.8_0.16_80)]">
                        “이 크기라면 오래 읽어도 편안하겠네.”
                    </blockquote>
                </div>
            </article>
        </div>
    )
}

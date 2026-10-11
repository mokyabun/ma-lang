import { X } from '@phosphor-icons/react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'

export function SettingsControls({ onBack }: { onBack: () => void }) {
    return (
        <div className="absolute right-5 top-5 z-30 flex items-center gap-1 max-[720px]:right-3 max-[720px]:top-3">
            <ThemeToggle className="rounded-full border border-transparent hover:border-border" />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                onClick={onBack}
                aria-label="설정 닫기"
            >
                <X aria-hidden="true" />
            </Button>
        </div>
    )
}

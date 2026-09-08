import { WarningCircle, X } from '@phosphor-icons/react'
import { useAtom } from 'jotai'

import { Button } from '@/components/ui/button'

import { workspaceErrorAtom } from '../atom'

export function WorkspaceError() {
    const [error, setError] = useAtom(workspaceErrorAtom)
    if (!error) return null

    return (
        <div
            className="absolute inset-x-4 top-4 z-50 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive backdrop-blur [&>button]:ml-auto"
            role="alert"
        >
            <WarningCircle aria-hidden="true" />
            <span>{error}</span>
            <Button variant="ghost" onClick={() => setError('')} aria-label="오류 닫기">
                <X aria-hidden="true" />
            </Button>
        </div>
    )
}

export function WorkspaceLoading() {
    return (
        <main className="grid size-full place-content-center justify-items-center bg-background">
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
        </main>
    )
}

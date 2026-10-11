import { useAtomValue } from 'jotai'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'

import { loadingAtom } from './atom'

// Blocking modal for long-running work (e.g. large CHARX or module imports): no close button,
// and ESC / outside clicks are ignored until the work finishes. Mounted once in the workspace
// route layout so settings pages, which render outside WorkspaceLayout, show it too.
export function LoadingDialog() {
    const loading = useAtomValue(loadingAtom)
    const progress = loading?.progress == null ? null : Math.max(0, Math.min(100, loading.progress))

    return (
        <Dialog open={Boolean(loading)} disablePointerDismissal>
            <DialogContent showCloseButton={false} className="justify-items-center text-center">
                <Spinner className="size-8 text-primary" />
                <DialogTitle className="whitespace-pre-wrap break-words">
                    {loading?.message}
                </DialogTitle>
                {loading?.detail && (
                    <DialogDescription className="whitespace-pre-wrap break-words">
                        {loading.detail}
                    </DialogDescription>
                )}
                {progress !== null && (
                    <progress
                        max={100}
                        value={progress}
                        className="h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-[width]"
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}

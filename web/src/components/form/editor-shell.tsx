import { Trash } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function EditorShell({
    title,
    onDelete,
    children,
}: {
    title: string
    onDelete?: () => void | Promise<void>
    children: React.ReactNode
}) {
    return (
        <section className="min-w-0 p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-border pb-4">
                <DialogHeader className="gap-1 text-left">
                    <DialogTitle className="font-serif text-xl">{title}</DialogTitle>
                    <DialogDescription>
                        Provider 인증 정보를 암호화해 안전하게 보관합니다.
                    </DialogDescription>
                </DialogHeader>
                {onDelete ? (
                    <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void onDelete()}
                        aria-label="삭제"
                    >
                        <Trash />
                    </Button>
                ) : null}
            </div>
            <div className="grid gap-4">{children}</div>
        </section>
    )
}

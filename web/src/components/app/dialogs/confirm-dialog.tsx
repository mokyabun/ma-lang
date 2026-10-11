import { useState } from 'react'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedSave } from '@/hooks/use-debounced-save'

interface ConfirmDialogProps {
    open: boolean
    title: string
    description: string
    confirmLabel?: string
    tone?: 'primary' | 'danger'
    onOpenChange: (open: boolean) => void
    onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = '확인',
    tone = 'danger',
    onOpenChange,
    onConfirm,
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                        variant={tone === 'danger' ? 'destructive' : 'default'}
                        onClick={async () => {
                            await onConfirm()
                            onOpenChange(false)
                        }}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

interface TextDialogProps {
    open: boolean
    title: string
    description: string
    defaultValue: string
    onOpenChange: (open: boolean) => void
    onConfirm: (value: string) => void | Promise<void>
}

export function TextDialog({
    open,
    title,
    description,
    defaultValue,
    onOpenChange,
    onConfirm,
}: TextDialogProps) {
    const [value, setValue] = useState(defaultValue)
    const autoSave = useDebouncedSave(
        value,
        async (next) => {
            const trimmed = next.trim()
            if (trimmed) await onConfirm(trimmed)
        },
        { enabled: open && Boolean(value.trim()) },
    )

    function changeOpen(nextOpen: boolean) {
        if (!nextOpen) void autoSave.flush()
        onOpenChange(nextOpen)
    }

    return (
        <Dialog open={open} onOpenChange={changeOpen}>
            <DialogContent className="sm:max-w-xl">
                <div className="grid gap-4" onBlurCapture={() => void autoSave.flush()}>
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>{description}</DialogDescription>
                    </DialogHeader>
                    <Textarea
                        rows={8}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                            닫기
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}

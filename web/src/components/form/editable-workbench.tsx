import { BookOpenText, DownloadSimple, Plus, Trash, UploadSimple } from '@phosphor-icons/react'
import { type ReactNode, useRef, useState } from 'react'

import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

interface EditableWorkbenchProps {
    title: string
    placeholder: string
    importAccept: string
    items: Array<{ id: string; name: string }>
    selectedId: string
    saving: boolean
    message: string
    exportUrl: string | null
    deleteTitle: string
    warnings?: string[]
    children: ReactNode
    extraActions?: ReactNode
    onSelect: (id: string) => Promise<void>
    onCreate: () => Promise<void>
    onImport: (file: File) => Promise<void>
    onDelete: () => Promise<void>
    onFlush: () => Promise<void>
}

export function EditableWorkbench(props: EditableWorkbenchProps) {
    const importRef = useRef<HTMLInputElement>(null)
    const [deleting, setDeleting] = useState(false)

    return (
        <section
            className="h-full min-h-0 flex-1 overflow-y-auto bg-transparent"
            aria-label={`${props.title} 작업대`}
            onBlurCapture={() => void props.onFlush()}
        >
            <Input
                ref={importRef}
                className="sr-only"
                type="file"
                accept={props.importAccept}
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void props.onImport(file)
                }}
            />
            <div className="w-full px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
                <header className="border-b border-border pb-5 pr-12">
                    <div className="flex items-end justify-between gap-4">
                        <h2 className="font-serif text-2xl leading-tight">{props.title}</h2>
                    </div>
                </header>
                <div className="grid gap-3 pt-5">
                    <Label className="grid gap-2 text-xs font-medium text-muted-foreground">
                        <Select
                            value={props.selectedId || '__none__'}
                            onValueChange={(next) => {
                                if (next && next !== '__none__') void props.onSelect(next)
                            }}
                        >
                            <SelectTrigger size="lg" className="w-full font-medium text-foreground">
                                <SelectValue placeholder={props.placeholder} />
                            </SelectTrigger>
                            <SelectContent align="start">
                                {!props.selectedId ? (
                                    <SelectItem value="__none__" disabled>
                                        {props.placeholder}
                                    </SelectItem>
                                ) : null}
                                {props.items.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                        {item.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Label>
                    <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                        <Button
                            variant="outline"
                            onClick={() => void props.onCreate()}
                            disabled={props.saving}
                        >
                            <Plus /> 새 항목
                        </Button>
                        <Button variant="outline" onClick={() => importRef.current?.click()}>
                            <UploadSimple /> 가져오기
                        </Button>
                    </div>
                </div>
                <main className="min-w-0">
                    {props.children ?? (
                        <div className="grid h-full place-content-center justify-items-center text-muted-foreground">
                            <BookOpenText />
                            <h2>편집할 항목을 선택하세요.</h2>
                        </div>
                    )}
                </main>
                <aside className="border-t border-border pt-5">
                    {props.warnings?.length ? (
                        <div className="mt-3 grid gap-2 border border-primary/30 bg-primary/5 p-3 text-xs">
                            {props.warnings.map((warning) => (
                                <small key={warning}>{warning}</small>
                            ))}
                        </div>
                    ) : null}
                    {props.message ? (
                        <Alert className="mt-3 border border-border bg-muted/40 p-3 text-xs text-foreground">
                            <AlertDescription>{props.message}</AlertDescription>
                        </Alert>
                    ) : null}
                    <div className="grid gap-2 pt-4">
                        {props.selectedId ? (
                            <>
                                {props.exportUrl ? (
                                    <Button
                                        size="lg"
                                        variant="outline"
                                        render={
                                            <a
                                                href={props.exportUrl}
                                                download
                                                aria-label="Risu 형식 내보내기"
                                            />
                                        }
                                    >
                                        <DownloadSimple /> Risu 형식 내보내기
                                    </Button>
                                ) : null}
                                {props.extraActions}
                                <Button
                                    size="lg"
                                    variant="destructive"
                                    onClick={() => setDeleting(true)}
                                >
                                    <Trash /> 삭제
                                </Button>
                            </>
                        ) : null}
                    </div>
                </aside>
            </div>
            <ConfirmDialog
                open={deleting}
                title={props.deleteTitle}
                description="서버에서 삭제되며 이 작업은 되돌릴 수 없습니다."
                confirmLabel="삭제"
                onOpenChange={setDeleting}
                onConfirm={props.onDelete}
            />
        </section>
    )
}

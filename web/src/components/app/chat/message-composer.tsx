import { ArrowUp, Stop } from '@phosphor-icons/react'
import { type FormEvent, type KeyboardEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function Composer({
    characterName,
    disabled,
    busy,
    canCancel,
    canSendEmpty,
    onSend,
    onCancel,
    onOpenSettings,
}: {
    characterName: string
    disabled: boolean
    busy: boolean
    canCancel: boolean
    canSendEmpty: boolean
    onSend: (content: string) => void
    onCancel: () => void
    onOpenSettings: () => void
}) {
    const [content, setContent] = useState('')

    function submit() {
        const value = content.trim()
        if ((!value && !canSendEmpty) || disabled) return
        setContent('')
        onSend(value)
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        submit()
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
        }
    }

    return (
        <div className="malang-composer bg-gradient-to-t from-background via-background to-transparent px-3 pb-3 pt-5 sm:px-8 sm:pb-4">
            <form
                className="malang-composer__inner mx-auto flex w-full items-end gap-2 rounded-xl border border-border bg-card p-2.5 shadow-lg focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/30 [&_textarea]:min-h-10 [&_textarea]:max-h-40 [&_textarea]:resize-none [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:px-1.5 [&_textarea]:shadow-none [&_textarea]:ring-0"
                onSubmit={handleSubmit}
            >
                <Textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={disabled}
                    placeholder={
                        busy
                            ? `${characterName}의 답변을 서버에서 생성하고 있습니다…`
                            : `${characterName}에게 메시지 보내기`
                    }
                    aria-label="메시지"
                />
                {busy ? (
                    <Button
                        variant="ghost"
                        type="button"
                        size="icon-sm"
                        className="shrink-0 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/80"
                        onClick={onCancel}
                        disabled={!canCancel}
                        aria-label="생성 중단"
                    >
                        <Stop aria-hidden="true" weight="fill" />
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        type="submit"
                        size="icon-sm"
                        className="shrink-0 rounded-full bg-primary text-primary-foreground"
                        disabled={disabled || (!content.trim() && !canSendEmpty)}
                        aria-label="메시지 전송"
                    >
                        <ArrowUp aria-hidden="true" weight="bold" />
                    </Button>
                )}
            </form>
            <div className="malang-composer__inner mx-auto mt-2 flex justify-between gap-4 px-1 font-mono text-[9px] text-muted-foreground max-sm:[&>span:last-child]:hidden">
                <span>Enter 전송 · Shift + Enter 줄바꿈</span>
                {disabled && !busy ? (
                    <Button variant="ghost" onClick={onOpenSettings}>
                        모델을 먼저 연결하세요
                    </Button>
                ) : (
                    <span>브라우저를 닫아도 생성은 계속됩니다.</span>
                )}
            </div>
        </div>
    )
}

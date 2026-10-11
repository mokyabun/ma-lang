import type { PromptToggle } from '@malang/shared'
import { useState } from 'react'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    parseToggleText,
    serializeToggleText,
    type ToggleSyntaxError,
} from '@/lib/prompt-toggle-syntax'

import { PromptToggleTextarea } from './prompt-toggle-textarea'

export function PromptToggleAdvancedEditor({
    value,
    maxCount,
    onChange,
}: {
    value: PromptToggle[]
    maxCount: number
    onChange: (value: PromptToggle[]) => void
}) {
    const source = serializeToggleText(value)
    const revision = JSON.stringify(value)
    const [draft, setDraft] = useState<{ revision: string; text: string } | null>(null)
    const [errors, setErrors] = useState<ToggleSyntaxError[]>([])
    const [notice, setNotice] = useState('')
    const [expanded, setExpanded] = useState(false)
    const text = draft?.text ?? source
    const dirty = text !== source
    const stale = dirty && draft !== null && draft.revision !== revision

    function changeText(next: string) {
        setDraft(
            next === source
                ? null
                : { revision: dirty && draft ? draft.revision : revision, text: next },
        )
        setErrors([])
        setNotice('')
    }

    function reset() {
        setDraft(null)
        setErrors([])
        setNotice('현재 토글 설정으로 되돌렸습니다.')
    }

    function apply() {
        if (stale || !dirty) return
        const result = parseToggleText(text, value, maxCount)
        setErrors(result.errors)
        if (!result.toggles) return
        onChange(result.toggles)
        setDraft(null)
        setNotice(`${result.toggles.length}개 토글을 반영했습니다.`)
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(text)
            setNotice('토글 텍스트를 복사했습니다.')
        } catch {
            setNotice('복사하지 못했습니다. 텍스트를 선택해 직접 복사하세요.')
        }
    }

    const editorProps = {
        text,
        dirty,
        stale,
        errors,
        notice,
        onChange: changeText,
        onApply: apply,
        onReset: reset,
        onCopy: copy,
    }

    return (
        <>
            <PromptToggleTextarea {...editorProps} onExpand={() => setExpanded(true)} />
            <Dialog open={expanded} onOpenChange={setExpanded}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>커스텀 토글 편집</DialogTitle>
                        <DialogDescription>
                            텍스트로 토글을 한 번에 수정합니다. 적용 버튼을 눌러 변경 사항을
                            반영하세요.
                        </DialogDescription>
                    </DialogHeader>
                    <PromptToggleTextarea {...editorProps} expanded />
                </DialogContent>
            </Dialog>
        </>
    )
}

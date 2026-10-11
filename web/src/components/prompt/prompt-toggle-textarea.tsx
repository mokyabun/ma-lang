import { ArrowsOut, ArrowCounterClockwise, Copy } from '@phosphor-icons/react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ToggleSyntaxError } from '@/lib/prompt-toggle-syntax'
import { cn } from '@/lib/utils'

type Props = {
    text: string
    dirty: boolean
    stale: boolean
    expanded?: boolean
    errors: ToggleSyntaxError[]
    notice: string
    onChange: (text: string) => void
    onApply: () => void
    onReset: () => void
    onCopy: () => void
    onExpand?: () => void
}

export function PromptToggleTextarea({
    text,
    dirty,
    stale,
    expanded,
    errors,
    notice,
    onChange,
    onApply,
    onReset,
    onCopy,
    onExpand,
}: Props) {
    const id = useId()

    return (
        <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={id}>커스텀 토글</Label>
                <span className="text-xs text-muted-foreground">텍스트 편집</span>
            </div>
            <div className="overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring/50">
                <Textarea
                    id={id}
                    value={text}
                    onChange={(event) => onChange(event.target.value)}
                    aria-describedby={`${id}-help ${id}-status`}
                    aria-invalid={errors.length > 0}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder={'=기본 설정=group\nshow_note=메모 표시\n==groupEnd'}
                    className={cn(
                        'field-sizing-fixed h-56 max-h-96 min-h-32 resize-y overflow-auto rounded-none border-0 bg-transparent p-3 font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent',
                        expanded && 'h-[50dvh] max-h-[60dvh]',
                    )}
                />
                <div className="flex flex-wrap items-center justify-end gap-1 border-t border-input bg-muted/20 px-2 py-1.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="토글 텍스트 복사"
                        title="복사"
                        onClick={onCopy}
                    >
                        <Copy />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="현재 토글로 되돌리기"
                        title="적용 전 변경 되돌리기"
                        disabled={!dirty}
                        onClick={onReset}
                    >
                        <ArrowCounterClockwise />
                    </Button>
                    {onExpand ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="토글 편집기 확대"
                            title="확대"
                            onClick={onExpand}
                        >
                            <ArrowsOut />
                        </Button>
                    ) : null}
                    <Button
                        type="button"
                        size="sm"
                        className="ml-2"
                        disabled={!dirty || stale}
                        onClick={onApply}
                    >
                        적용
                    </Button>
                </div>
            </div>
            <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">
                한 줄에 하나씩 입력하세요. 적용 전 변경은 저장되지 않으므로, 다른 메뉴로 이동하기
                전에 적용하세요. 같은 키와 타입의 기존 기본값은 유지됩니다. 모두 지우고 적용하면
                토글이 제거됩니다.
            </p>
            <div id={`${id}-status`} aria-live="polite" className="text-xs leading-relaxed">
                {stale ? (
                    <p className="text-destructive">
                        기존 토글이 변경되었습니다. ‘현재 토글로 되돌리기’ 후 다시 편집하세요.
                    </p>
                ) : null}
                {errors.length ? (
                    <ul className="max-h-32 list-inside list-disc overflow-y-auto text-destructive">
                        {errors.map((error, index) => (
                            <li key={index}>
                                {error.line === null ? '' : `${error.line}행: `}
                                {error.message}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-muted-foreground">
                        {notice ||
                            (dirty
                                ? '적용하지 않은 변경 사항이 있습니다.'
                                : '현재 토글 설정과 동일합니다.')}
                    </p>
                )}
            </div>
            <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    문법 안내
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-muted/40 p-3 font-mono leading-relaxed">{`키=표시 이름
키=표시 이름=select=옵션1,옵션2
키=표시 이름=text
키=표시 이름=textarea
=그룹 이름=group
==groupEnd
=구분선 이름=divider
=안내 문구=caption`}</pre>
                <p className="mt-2 leading-relaxed">
                    타입을 생략하면 켜기/끄기 토글입니다. boolean, toggle도 사용할 수 있습니다. =는
                    필드, 쉼표는 선택 옵션 구분에 사용합니다.
                </p>
            </details>
        </div>
    )
}

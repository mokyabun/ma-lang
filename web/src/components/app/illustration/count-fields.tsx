import { type IllustrationCount, MAX_ILLUSTRATIONS_PER_MESSAGE } from '@malang/shared'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Equal bounds mean a fixed count; the analysis AI picks within a range. */
export function CountFields({
    value,
    onChange,
}: {
    value: IllustrationCount
    onChange: (value: IllustrationCount) => void
}) {
    function set(bound: keyof IllustrationCount, raw: string) {
        const parsed = Math.round(Number(raw))
        if (!Number.isFinite(parsed)) return
        const clamped = Math.min(MAX_ILLUSTRATIONS_PER_MESSAGE, Math.max(1, parsed))
        const next = { ...value, [bound]: clamped }
        // Keep the pair valid while typing: moving one bound past the other drags it along.
        if (bound === 'min' && next.max < clamped) next.max = clamped
        if (bound === 'max' && next.min > clamped) next.min = clamped
        onChange(next)
    }

    return (
        <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-3">
                <Label className="grid gap-2 text-xs font-medium text-muted-foreground">
                    최소 장 수
                    <Input
                        type="number"
                        min={1}
                        max={MAX_ILLUSTRATIONS_PER_MESSAGE}
                        value={value.min}
                        onChange={(event) => set('min', event.target.value)}
                    />
                </Label>
                <Label className="grid gap-2 text-xs font-medium text-muted-foreground">
                    최대 장 수
                    <Input
                        type="number"
                        min={1}
                        max={MAX_ILLUSTRATIONS_PER_MESSAGE}
                        value={value.max}
                        onChange={(event) => set('max', event.target.value)}
                    />
                </Label>
            </div>
            <p className="text-[10px] text-muted-foreground">
                {value.min === value.max
                    ? `응답마다 ${value.min}장을 만듭니다.`
                    : `응답 내용에 맞춰 ${value.min}~${value.max}장 사이로 만듭니다.`}
            </p>
        </div>
    )
}

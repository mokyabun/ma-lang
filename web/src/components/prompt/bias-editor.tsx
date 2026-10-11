import type { BiasEntry } from '@malang/shared'
import { DownloadSimple, Plus, Trash, UploadSimple } from '@phosphor-icons/react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const BIAS_MAX = 100

export function BiasEditor({
    value,
    onChange,
    min,
    transferable = false,
}: {
    value: BiasEntry[]
    onChange: (value: BiasEntry[]) => void
    /** PocketRisu allows the -101 strong ban only in the preset's bias. */
    min: -100 | -101
    transferable?: boolean
}) {
    const importRef = useRef<HTMLInputElement>(null)
    const [importError, setImportError] = useState('')
    const update = (index: number, entry: BiasEntry) =>
        onChange(value.map((current, position) => (position === index ? entry : current)))

    async function importFile(file: File) {
        try {
            const parsed: unknown = JSON.parse(await file.text())
            if (!isBiasList(parsed)) throw new Error('invalid bias list')
            onChange(parsed)
            setImportError('')
        } catch {
            setImportError('bias JSON을 읽지 못했습니다.')
        }
    }

    function exportFile() {
        const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'bias.json'
        anchor.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                <div>
                    <strong className="block text-xs">Bias</strong>
                    <span className="text-[10px] leading-5 text-muted-foreground">
                        문자열이 나올 가능성을 {min}~{BIAS_MAX}로 조절합니다.
                        {min === -101 ? ' -101은 일부 모델에서 강력 금지어로 동작합니다.' : ''}{' '}
                        토크나이저가 모델과 맞아야 정확히 동작합니다.
                    </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {transferable ? (
                        <>
                            <Input
                                ref={importRef}
                                className="sr-only"
                                type="file"
                                accept=".json"
                                onChange={(event) => {
                                    const file = event.target.files?.[0]
                                    event.target.value = ''
                                    if (file) void importFile(file)
                                }}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Bias 가져오기"
                                onClick={() => importRef.current?.click()}
                            >
                                <UploadSimple />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Bias 내보내기"
                                onClick={exportFile}
                            >
                                <DownloadSimple />
                            </Button>
                        </>
                    ) : null}
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onChange([...value, ['', 0]])}
                    >
                        <Plus aria-hidden="true" /> 추가
                    </Button>
                </div>
            </div>
            {importError ? (
                <p role="alert" className="text-xs text-destructive">
                    {importError}
                </p>
            ) : null}
            {value.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">Bias 없음</p>
            ) : (
                value.map(([text, bias], index) => (
                    <div
                        // Entries carry no ID and may repeat the same string.
                        key={index}
                        className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-2"
                    >
                        <Input
                            aria-label={`Bias ${index + 1} 문자열`}
                            placeholder="string"
                            value={text}
                            onChange={(event) => update(index, [event.target.value, bias])}
                        />
                        <Input
                            aria-label={`Bias ${index + 1} 값`}
                            type="number"
                            min={min}
                            max={BIAS_MAX}
                            step={1}
                            value={bias}
                            onChange={(event) =>
                                update(index, [text, clampBias(event.target.value, min)])
                            }
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Bias ${index + 1} 삭제`}
                            onClick={() =>
                                onChange(value.filter((_, position) => position !== index))
                            }
                        >
                            <Trash />
                        </Button>
                    </div>
                ))
            )}
        </div>
    )
}

function clampBias(raw: string, min: number): number {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return 0
    return Math.min(BIAS_MAX, Math.max(min, parsed))
}

function isBiasList(value: unknown): value is BiasEntry[] {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) =>
                Array.isArray(entry) &&
                entry.length === 2 &&
                typeof entry[0] === 'string' &&
                typeof entry[1] === 'number' &&
                Number.isFinite(entry[1]),
        )
    )
}

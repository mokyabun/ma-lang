import type { IllustrationTestResult } from '@malang/shared'
import { ImageSquare } from '@phosphor-icons/react'
import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

export function TestImagePreview({
    result,
    error,
    busy,
}: {
    result: IllustrationTestResult | null
    error: string
    busy: boolean
}) {
    if (error) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )
    }
    return (
        <figure className="grid gap-2">
            <div className="grid min-h-48 place-items-center overflow-hidden rounded-md border border-dashed border-border bg-muted/20">
                {busy ? (
                    <Spinner />
                ) : result ? (
                    <img
                        className="max-h-[32rem] w-auto object-contain"
                        src={result.image}
                        alt="테스트 생성 결과"
                    />
                ) : (
                    <ImageSquare className="size-8 text-muted-foreground" aria-hidden="true" />
                )}
            </div>
            {result && !busy ? (
                <figcaption className="font-mono text-[10px] text-muted-foreground">
                    {result.model} · {result.width}×{result.height} · seed {result.seed}
                </figcaption>
            ) : null}
        </figure>
    )
}

export function useTestGeneration() {
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState<IllustrationTestResult | null>(null)
    const [error, setError] = useState('')

    async function run(generate: () => Promise<IllustrationTestResult>) {
        setBusy(true)
        setError('')
        try {
            setResult(await generate())
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '테스트 생성에 실패했습니다.')
        } finally {
            setBusy(false)
        }
    }

    return { busy, result, error, run }
}

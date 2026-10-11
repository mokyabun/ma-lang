import { ArrowClockwise } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { api, type UsageStatistics } from '@/lib/api'

export function UsagePanel() {
    const [usage, setUsage] = useState<UsageStatistics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    async function load() {
        try {
            setUsage(await api.usageStatistics())
            setError('')
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '사용량 통계를 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        queueMicrotask(() => void load())
    }, [])

    const maxDaily = useMemo(
        () => Math.max(1, ...(usage?.days.map((day) => day.inputTokens + day.outputTokens) ?? [])),
        [usage],
    )

    if (loading)
        return (
            <div className="grid min-h-64 place-items-center">
                <Spinner />
            </div>
        )

    return (
        <section>
            <div className="mb-5 flex items-start justify-between gap-4">
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    저장된 생성 기록을 기준으로 요청 수, 토큰과 평균 응답 시간을 집계합니다.
                </p>
                <Button size="sm" variant="outline" onClick={() => void load()}>
                    <ArrowClockwise /> 새로고침
                </Button>
            </div>
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            {usage && (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Stat
                            label="요청"
                            value={formatNumber(usage.totals.requests)}
                            note={
                                usage.totals.failed
                                    ? `실패 ${usage.totals.failed.toLocaleString('ko-KR')}`
                                    : undefined
                            }
                        />
                        <Stat label="입력 토큰" value={formatNumber(usage.totals.inputTokens)} />
                        <Stat label="출력 토큰" value={formatNumber(usage.totals.outputTokens)} />
                    </div>

                    <section className="mt-5 rounded-xl border border-border p-5">
                        <h3 className="font-serif text-lg">토큰 사용 현황</h3>
                        {!usage.days.length ? (
                            <p className="mt-8 text-center text-sm text-muted-foreground">
                                아직 집계할 사용량이 없습니다.
                            </p>
                        ) : (
                            <div className="mt-5 flex h-64 items-end gap-2 overflow-x-auto pb-7">
                                {usage.days.map((day) => {
                                    const inputHeight = (day.inputTokens / maxDaily) * 100
                                    const outputHeight = (day.outputTokens / maxDaily) * 100
                                    return (
                                        <div
                                            key={day.date}
                                            className="relative flex h-full min-w-9 flex-1 items-end justify-center"
                                            title={`${day.date}\n입력 ${formatNumber(day.inputTokens)}\n출력 ${formatNumber(day.outputTokens)}`}
                                        >
                                            <div className="flex h-full w-full max-w-12 flex-col justify-end overflow-hidden rounded-t-md bg-muted">
                                                <div
                                                    className="bg-primary/90"
                                                    style={{ height: `${inputHeight}%` }}
                                                />
                                                <div
                                                    className="bg-amber-400"
                                                    style={{ height: `${outputHeight}%` }}
                                                />
                                            </div>
                                            <span className="absolute top-full mt-2 text-[10px] text-muted-foreground">
                                                {day.date.slice(5).replace('-', '/')}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        <div className="mt-2 flex justify-end gap-4 text-xs text-muted-foreground">
                            <span>
                                <i className="mr-1 inline-block size-2 rounded-full bg-primary" />
                                입력 토큰
                            </span>
                            <span>
                                <i className="mr-1 inline-block size-2 rounded-full bg-amber-400" />
                                출력 토큰
                            </span>
                        </div>
                    </section>

                    <section className="mt-5 overflow-hidden rounded-xl border border-border">
                        <h3 className="border-b border-border px-4 py-3 font-serif text-lg">
                            모델별
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[42rem] text-left text-xs">
                                <thead className="text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3">모델</th>
                                        <th className="px-3 py-3 text-right">요청</th>
                                        <th className="px-3 py-3 text-right">입력 토큰</th>
                                        <th className="px-3 py-3 text-right">출력 토큰</th>
                                        <th className="px-4 py-3 text-right">평균 응답</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {usage.models.map((model) => (
                                        <tr
                                            key={`${model.provider}:${model.modelId}`}
                                            className="border-t border-border"
                                        >
                                            <td className="px-4 py-3 font-medium">
                                                {model.modelId}{' '}
                                                <span className="font-normal text-muted-foreground">
                                                    ({model.provider})
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">
                                                {formatNumber(model.requests)}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">
                                                {formatNumber(model.inputTokens)}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">
                                                {formatNumber(model.outputTokens)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums">
                                                {model.avgDurationMs === null
                                                    ? '—'
                                                    : `${(model.avgDurationMs / 1_000).toFixed(2)}s`}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </section>
    )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div className="rounded-xl border border-border bg-card/40 p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <strong className="mt-2 block font-serif text-3xl tabular-nums">{value}</strong>
            {note && <p className="mt-2 text-xs text-destructive">{note}</p>}
        </div>
    )
}

function formatNumber(value: number): string {
    return value.toLocaleString('ko-KR')
}

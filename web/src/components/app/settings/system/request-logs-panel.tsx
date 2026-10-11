import {
    ArrowClockwise,
    CaretDown,
    CaretRight,
    ClipboardText,
    MagnifyingGlass,
    Trash,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { api, type ProviderRequestLog, type ProviderRequestLogDetail } from '@/lib/api'

export function RequestLogsPanel() {
    const [requests, setRequests] = useState<ProviderRequestLog[]>([])
    const [details, setDetails] = useState<Record<string, ProviderRequestLogDetail>>({})
    const [expanded, setExpanded] = useState('')
    const [query, setQuery] = useState('')
    const [status, setStatus] = useState<'all' | 'success' | 'failed'>('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [clearOpen, setClearOpen] = useState(false)

    async function load() {
        try {
            setRequests((await api.providerRequestLogs()).requests)
            setError('')
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : '리퀘스트 로그를 불러오지 못했습니다.',
            )
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        queueMicrotask(() => void load())
    }, [])

    const visible = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('ko')
        return requests.filter((request) => {
            const matchesStatus =
                status === 'all' ||
                (status === 'success' && request.status === 'complete') ||
                (status === 'failed' && request.status !== 'complete')
            return (
                matchesStatus &&
                (!needle ||
                    [
                        request.modelId,
                        request.provider,
                        request.errorMessage,
                        request.conversationTitle,
                    ]
                        .filter(Boolean)
                        .join('\n')
                        .toLocaleLowerCase('ko')
                        .includes(needle))
            )
        })
    }, [query, requests, status])

    async function toggleExpanded(request: ProviderRequestLog) {
        if (expanded === request.id) {
            setExpanded('')
            return
        }
        setExpanded(request.id)
        if (details[request.id]) return
        try {
            const detail = await api.providerRequestLog(request.id)
            setDetails((current) => ({ ...current, [request.id]: detail }))
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '요청 상세를 불러오지 못했습니다.')
        }
    }

    async function clear() {
        try {
            await api.clearProviderRequestLogs()
            setRequests([])
            setDetails({})
            setExpanded('')
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : '리퀘스트 로그를 삭제하지 못했습니다.',
            )
        }
    }

    return (
        <section>
            <p className="mb-5 text-sm leading-6 text-muted-foreground">
                모델 제공자로 보낸 요청의 URL, 마스킹된 헤더, 본문, 응답과 토큰 사용량을 기록합니다.
                최근 100건의 상세 요청을 보존합니다.
            </p>
            <p className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-5 text-muted-foreground">
                인증 키와 쿠키는 저장 전에 마스킹됩니다. 요청 본문에는 대화와 시스템 프롬프트가
                포함될 수 있습니다.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
                <div className="relative min-w-56 flex-1">
                    <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="모델, 제공자, 오류 메시지로 검색"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
                {(['all', 'success', 'failed'] as const).map((value) => (
                    <Button
                        key={value}
                        size="sm"
                        variant={status === value ? 'secondary' : 'outline'}
                        onClick={() => setStatus(value)}
                    >
                        {{ all: '전체', success: '성공', failed: '실패' }[value]}
                    </Button>
                ))}
                <Button size="sm" variant="outline" onClick={() => void load()}>
                    <ArrowClockwise /> 새로고침
                </Button>
                <Button
                    disabled={!requests.length}
                    size="sm"
                    variant="destructive"
                    onClick={() => setClearOpen(true)}
                >
                    <Trash /> 전체 삭제
                </Button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
                {requests.length}개 중 {visible.length}개 표시
            </p>
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            {loading ? (
                <div className="grid min-h-48 place-items-center rounded-xl border border-border">
                    <Spinner />
                </div>
            ) : !visible.length ? (
                <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                    표시할 리퀘스트 로그가 없습니다.
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                    {visible.map((request) => {
                        const detail = details[request.id]
                        return (
                            <div
                                key={request.id}
                                className="border-b border-border last:border-b-0"
                            >
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                                    onClick={() => void toggleExpanded(request)}
                                >
                                    <Badge
                                        variant={
                                            request.status === 'complete'
                                                ? 'outline'
                                                : 'destructive'
                                        }
                                    >
                                        {request.statusCode}
                                    </Badge>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {new Date(request.startedAt).toLocaleTimeString('ko-KR')}
                                    </span>
                                    <strong className="min-w-0 flex-1 truncate text-sm">
                                        {request.modelId}
                                    </strong>
                                    <span className="hidden text-xs tabular-nums text-muted-foreground md:inline">
                                        {formatDuration(request.durationMs)}
                                    </span>
                                    <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                                        {formatNumber(request.inputTokens)} →{' '}
                                        {formatNumber(request.outputTokens)}
                                    </span>
                                    <Badge variant="outline">채팅</Badge>
                                    {expanded === request.id ? <CaretDown /> : <CaretRight />}
                                </button>
                                {expanded === request.id && (
                                    <div className="border-t border-border bg-muted/20 p-4">
                                        {!detail ? (
                                            <Spinner />
                                        ) : (
                                            <div className="grid gap-4">
                                                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                                                    <Metric
                                                        label="제공자"
                                                        value={detail.provider}
                                                    />
                                                    <Metric
                                                        label="소요 시간"
                                                        value={formatDuration(detail.durationMs)}
                                                    />
                                                    <Metric
                                                        label="입력 토큰"
                                                        value={formatNumber(detail.inputTokens)}
                                                    />
                                                    <Metric
                                                        label="출력 토큰"
                                                        value={formatNumber(detail.outputTokens)}
                                                    />
                                                </div>
                                                {detail.errorMessage && (
                                                    <p className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                                                        {detail.errorMessage}
                                                    </p>
                                                )}
                                                {detail.requests.length > 0 ? (
                                                    detail.requests.map((captured, index) => (
                                                        <div key={index} className="grid gap-4">
                                                            <LogBlock
                                                                title={`URL · ${requestSnapshot(captured.request).method}`}
                                                                value={
                                                                    requestSnapshot(
                                                                        captured.request,
                                                                    ).endpoint
                                                                }
                                                            />
                                                            <LogBlock
                                                                title="요청 헤더"
                                                                value={
                                                                    requestSnapshot(
                                                                        captured.request,
                                                                    ).headers
                                                                }
                                                            />
                                                            <LogBlock
                                                                title="요청 본문"
                                                                value={
                                                                    requestSnapshot(
                                                                        captured.request,
                                                                    ).body
                                                                }
                                                            />
                                                            <LogBlock
                                                                title="적용 파라미터"
                                                                value={captured.parameters}
                                                            />
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-xs text-muted-foreground">
                                                        이 요청은 상세 기록이 꺼진 상태에서 생성되어
                                                        본문이 없습니다.
                                                    </p>
                                                )}
                                                <LogBlock title="응답" value={detail.response} />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
            <ConfirmDialog
                confirmLabel="전체 삭제"
                description="현재 보이는 리퀘스트 로그와 저장된 상세 본문을 비웁니다. 누적 사용량 통계는 유지됩니다."
                open={clearOpen}
                title="리퀘스트 로그를 비울까요?"
                onConfirm={clear}
                onOpenChange={setClearOpen}
            />
        </section>
    )
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono font-medium">{value}</p>
        </div>
    )
}

function LogBlock({ title, value }: { title: string; value: unknown }) {
    const content = serialize(value)
    return (
        <section className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-xs font-medium">{title}</h4>
                <Button
                    aria-label={`${title} 복사`}
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => void navigator.clipboard.writeText(content)}
                >
                    <ClipboardText />
                </Button>
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono text-[10px] leading-5">
                {content}
            </pre>
        </section>
    )
}

function requestSnapshot(value: unknown): {
    endpoint: string
    method: string
    headers: Record<string, string>
    body: unknown
} {
    if (!value || typeof value !== 'object') {
        return { endpoint: '—', method: 'POST', headers: {}, body: value }
    }
    const request = value as Record<string, unknown>
    return {
        endpoint: typeof request.endpoint === 'string' ? request.endpoint : '—',
        method: typeof request.method === 'string' ? request.method : 'POST',
        headers:
            request.headers && typeof request.headers === 'object'
                ? (request.headers as Record<string, string>)
                : {},
        body: request.body,
    }
}

function serialize(value: unknown): string {
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2) ?? String(value)
}

function formatNumber(value: number | null): string {
    return value === null ? '—' : value.toLocaleString('ko-KR')
}

function formatDuration(value: number | null): string {
    return value === null ? '—' : `${(value / 1_000).toFixed(2)}s`
}

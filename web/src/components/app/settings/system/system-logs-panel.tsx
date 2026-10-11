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
import { api, type SystemLogEntry } from '@/lib/api'
import { cn } from '@/lib/utils'

export function SystemLogsPanel() {
    const [logs, setLogs] = useState<SystemLogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [query, setQuery] = useState('')
    const [level, setLevel] = useState<'all' | SystemLogEntry['level']>('all')
    const [expanded, setExpanded] = useState<number | null>(null)
    const [clearOpen, setClearOpen] = useState(false)

    async function load() {
        try {
            setLogs((await api.systemLogs()).logs)
            setError('')
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '시스템 로그를 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        queueMicrotask(() => void load())
    }, [])

    const visible = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('ko')
        return logs.filter(
            (log) =>
                (level === 'all' || log.level === level) &&
                (!needle ||
                    [log.message, log.module, log.event, log.details]
                        .filter(Boolean)
                        .join('\n')
                        .toLocaleLowerCase('ko')
                        .includes(needle)),
        )
    }, [level, logs, query])

    async function copyVisible() {
        const text = visible
            .map(
                (log) =>
                    `[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()} ${log.module ?? 'server'}: ${log.message}${log.details ? `\n${log.details}` : ''}`,
            )
            .join('\n\n')
        await navigator.clipboard.writeText(text)
    }

    async function clear() {
        try {
            await api.clearSystemLogs()
            setLogs([])
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '로그를 삭제하지 못했습니다.')
        }
    }

    return (
        <section>
            <p className="mb-5 text-sm leading-6 text-muted-foreground">
                서버에서 발생한 정보, 경고와 오류 이벤트를 확인합니다. 민감한 인증 정보와 프롬프트는
                저장 전에 마스킹됩니다.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
                <div className="relative min-w-56 flex-1">
                    <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="메시지, 모듈, 이벤트로 검색"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
                {(['all', 'error', 'warning', 'info', 'debug'] as const).map((value) => (
                    <Button
                        key={value}
                        size="sm"
                        variant={level === value ? 'secondary' : 'outline'}
                        onClick={() => setLevel(value)}
                    >
                        {levelLabel(value)}
                    </Button>
                ))}
                <Button size="sm" variant="outline" onClick={() => void load()}>
                    <ArrowClockwise /> 새로고침
                </Button>
                <Button
                    disabled={!visible.length}
                    size="sm"
                    variant="outline"
                    onClick={() => void copyVisible()}
                >
                    <ClipboardText /> 보이는 항목 복사
                </Button>
                <Button
                    disabled={!logs.length}
                    size="sm"
                    variant="destructive"
                    onClick={() => setClearOpen(true)}
                >
                    <Trash /> 전체 삭제
                </Button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
                {logs.length}개 중 {visible.length}개 표시
            </p>
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            {loading ? (
                <div className="grid min-h-48 place-items-center rounded-xl border border-border">
                    <Spinner />
                </div>
            ) : !visible.length ? (
                <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                    표시할 시스템 로그가 없습니다.
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                    {visible.map((log) => (
                        <button
                            key={log.id}
                            type="button"
                            className="block w-full border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/40"
                            onClick={() =>
                                setExpanded((current) => (current === log.id ? null : log.id))
                            }
                        >
                            <span className="flex items-center gap-3">
                                <Badge
                                    variant={log.level === 'error' ? 'destructive' : 'outline'}
                                    className={cn(
                                        log.level === 'warning' &&
                                            'border-amber-500/40 text-amber-600',
                                    )}
                                >
                                    {levelLabel(log.level)}
                                </Badge>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {relativeTime(log.timestamp)}
                                </span>
                                <strong className="min-w-0 flex-1 truncate text-sm font-medium">
                                    {log.message}
                                </strong>
                                <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                                    {log.module ?? 'server'}
                                </span>
                                {expanded === log.id ? <CaretDown /> : <CaretRight />}
                            </span>
                            {expanded === log.id && (
                                <span className="mt-3 block border-t border-border pt-3">
                                    <span className="block font-mono text-[10px] text-muted-foreground">
                                        {new Date(log.timestamp).toLocaleString('ko-KR')} ·{' '}
                                        {log.event ?? 'event 없음'}
                                    </span>
                                    {log.details && (
                                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-[10px] leading-5">
                                            {log.details}
                                        </pre>
                                    )}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
            <ConfirmDialog
                confirmLabel="전체 삭제"
                description="저장된 시스템 로그를 모두 영구 삭제합니다."
                open={clearOpen}
                title="시스템 로그를 비울까요?"
                onConfirm={clear}
                onOpenChange={setClearOpen}
            />
        </section>
    )
}

function levelLabel(level: 'all' | SystemLogEntry['level']): string {
    return { all: '전체', error: '오류', warning: '경고', info: '정보', debug: '디버그' }[level]
}

function relativeTime(timestamp: number): string {
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000))
    if (seconds < 60) return `${seconds}초 전`
    if (seconds < 3_600) return `${Math.floor(seconds / 60)}분 전`
    if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}시간 전`
    return new Date(timestamp).toLocaleDateString('ko-KR')
}

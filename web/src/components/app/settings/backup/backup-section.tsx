import {
    ArrowCounterClockwise,
    ClockCounterClockwise,
    DownloadSimple,
    Plus,
    Trash,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { ConfirmDialog } from '@/components/app/dialogs/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { api, type BackupSnapshot } from '@/lib/api'
import { cn } from '@/lib/utils'

import { SectionHeading } from '../../page-heading'
import type { SettingsPanelProps } from '../types'

export function BackupSection({
    settings,
    onSettingsChange,
    embedded = false,
}: Pick<SettingsPanelProps, 'settings' | 'onSettingsChange'> & { embedded?: boolean }) {
    const [allowed, setAllowed] = useState<boolean | null>(null)
    const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState('')
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [restoreTarget, setRestoreTarget] = useState<BackupSnapshot | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<BackupSnapshot | null>(null)

    useEffect(() => {
        let active = true
        void Promise.all([api.backupConfig(), api.backupSnapshots()]).then(
            ([config, result]) => {
                if (!active) return
                setAllowed(config.allowed)
                setSnapshots(result.snapshots)
                setLoading(false)
            },
            (cause: unknown) => {
                if (!active) return
                setError(cause instanceof Error ? cause.message : '스냅샷을 불러오지 못했습니다.')
                setLoading(false)
            },
        )
        return () => {
            active = false
        }
    }, [])

    async function toggle(enabled: boolean) {
        setBusy('toggle')
        setError('')
        try {
            onSettingsChange(await api.updateSettings({ autoBackupEnabled: enabled }))
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '백업 설정을 저장하지 못했습니다.')
        } finally {
            setBusy('')
        }
    }

    async function createSnapshot() {
        setBusy('create')
        setError('')
        setNotice('')
        try {
            const snapshot = await api.createBackupSnapshot()
            setSnapshots((current) => [snapshot, ...current])
            setNotice('현재 상태를 새 스냅샷으로 저장했습니다.')
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '스냅샷을 만들지 못했습니다.')
        } finally {
            setBusy('')
        }
    }

    async function restoreSnapshot(snapshot: BackupSnapshot) {
        setBusy(`restore:${snapshot.id}`)
        setError('')
        try {
            await api.restoreBackupSnapshot(snapshot.id)
            window.location.reload()
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '스냅샷을 복원하지 못했습니다.')
            setBusy('')
        }
    }

    async function downloadSnapshot(snapshot: BackupSnapshot) {
        setBusy(`download:${snapshot.id}`)
        setError('')
        try {
            const blob = await api.downloadBackupSnapshot(snapshot.id)
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = snapshot.id
            document.body.append(anchor)
            anchor.click()
            anchor.remove()
            window.setTimeout(() => URL.revokeObjectURL(url), 0)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '스냅샷을 내려받지 못했습니다.')
        } finally {
            setBusy('')
        }
    }

    async function deleteSnapshot(snapshot: BackupSnapshot) {
        setBusy(`delete:${snapshot.id}`)
        setError('')
        try {
            await api.deleteBackupSnapshot(snapshot.id)
            setSnapshots((current) => current.filter((item) => item.id !== snapshot.id))
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '스냅샷을 삭제하지 못했습니다.')
        } finally {
            setBusy('')
        }
    }

    return (
        <div className={cn(!embedded && 'h-full overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4')}>
            {embedded ? (
                <div className="mb-5 flex justify-end">
                    <Button disabled={Boolean(busy)} onClick={() => void createSnapshot()}>
                        {busy === 'create' ? <Spinner /> : <Plus />}
                        지금 스냅샷 만들기
                    </Button>
                </div>
            ) : (
                <SectionHeading
                    className="mb-6 pr-12 [&_h2]:text-2xl"
                    title="스냅샷"
                    actions={
                        <Button disabled={Boolean(busy)} onClick={() => void createSnapshot()}>
                            {busy === 'create' ? <Spinner /> : <Plus />}
                            지금 스냅샷 만들기
                        </Button>
                    }
                />
            )}

            <section className="rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center justify-between gap-5">
                    <div>
                        <strong className="text-sm">자동 스냅샷</strong>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            변경사항이 있으면 시작 시와 5분마다 저장합니다. 자동본은 최근
                            20개·500MB까지 유지됩니다.
                        </p>
                    </div>
                    <Switch
                        aria-label="자동 스냅샷"
                        checked={allowed === true && (settings?.autoBackupEnabled ?? true)}
                        disabled={allowed !== true || !settings || Boolean(busy)}
                        onCheckedChange={(checked) => void toggle(checked)}
                    />
                </div>
                {allowed === false && (
                    <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                        서버 환경 변수 AUTO_BACKUP_ENABLED=false로 자동 생성이 잠겨 있습니다. 수동
                        스냅샷은 계속 사용할 수 있습니다.
                    </p>
                )}
            </section>

            <section className="mt-7">
                <div className="mb-3 flex items-end justify-between gap-4">
                    <div>
                        <h3 className="font-serif text-lg">저장된 시점</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            데이터베이스만 포함하며 이미지·미디어 파일은 포함하지 않습니다.
                        </p>
                    </div>
                    {!loading && snapshots.length > 0 && (
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {snapshots.length}개 · {formatBytes(totalSize(snapshots))}
                        </span>
                    )}
                </div>

                {loading ? (
                    <div className="flex min-h-36 items-center justify-center rounded-xl border border-border">
                        <Spinner className="text-muted-foreground" />
                    </div>
                ) : snapshots.length === 0 ? (
                    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 text-center">
                        <ClockCounterClockwise className="size-7 text-muted-foreground" />
                        <p className="mt-3 text-sm font-medium">아직 저장된 스냅샷이 없습니다</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            위 버튼을 눌러 지금 상태를 첫 시점으로 남겨 보세요.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-xl border border-border bg-card/30">
                        {snapshots.map((snapshot, index) => (
                            <div
                                className="flex items-center gap-4 px-4 py-3.5 not-last:border-b not-last:border-border max-sm:items-start"
                                key={snapshot.id}
                            >
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                    <ClockCounterClockwise className="size-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">
                                            {formatDate(snapshot.createdAt)}
                                        </span>
                                        {index === 0 && <Badge>최신</Badge>}
                                        <Badge variant="outline">{kindLabel(snapshot.kind)}</Badge>
                                    </div>
                                    <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                                        {formatBytes(snapshot.size)}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        aria-label="이 스냅샷으로 복원"
                                        disabled={Boolean(busy)}
                                        size="icon-xs"
                                        title="복원"
                                        variant="ghost"
                                        onClick={() => setRestoreTarget(snapshot)}
                                    >
                                        {busy === `restore:${snapshot.id}` ? (
                                            <Spinner />
                                        ) : (
                                            <ArrowCounterClockwise />
                                        )}
                                    </Button>
                                    <Button
                                        aria-label="스냅샷 다운로드"
                                        disabled={Boolean(busy)}
                                        size="icon-xs"
                                        title="다운로드"
                                        variant="ghost"
                                        onClick={() => void downloadSnapshot(snapshot)}
                                    >
                                        {busy === `download:${snapshot.id}` ? (
                                            <Spinner />
                                        ) : (
                                            <DownloadSimple />
                                        )}
                                    </Button>
                                    <Button
                                        aria-label="스냅샷 삭제"
                                        disabled={Boolean(busy)}
                                        size="icon-xs"
                                        title="삭제"
                                        variant="ghost"
                                        onClick={() => setDeleteTarget(snapshot)}
                                    >
                                        {busy === `delete:${snapshot.id}` ? <Spinner /> : <Trash />}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <p className="mt-5 text-xs leading-5 text-muted-foreground">
                복원 직전 상태는 별도 ‘복원 전’ 스냅샷으로 자동 보관됩니다. 암호화된 API 키는 스냅샷
                생성 당시의 관리자 비밀번호로 다시 로그인해야 사용할 수 있습니다.
            </p>
            {notice && <p className="mt-4 text-sm text-primary">{notice}</p>}
            {error && (
                <p role="alert" className="mt-4 text-sm text-destructive">
                    {error}
                </p>
            )}

            <ConfirmDialog
                confirmLabel="이 시점으로 복원"
                description="현재 데이터는 선택한 시점으로 교체됩니다. 바로 전 상태는 안전 스냅샷으로 자동 저장되고, 완료 후 앱을 새로고침합니다."
                open={restoreTarget !== null}
                title="스냅샷을 복원할까요?"
                onConfirm={() => (restoreTarget ? restoreSnapshot(restoreTarget) : undefined)}
                onOpenChange={(open) => !open && setRestoreTarget(null)}
            />
            <ConfirmDialog
                confirmLabel="삭제"
                description="이 스냅샷은 목록과 서버에서 영구적으로 삭제됩니다."
                open={deleteTarget !== null}
                title="스냅샷을 삭제할까요?"
                onConfirm={() => (deleteTarget ? deleteSnapshot(deleteTarget) : undefined)}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
            />
        </div>
    )
}

function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'medium',
    }).format(timestamp)
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function totalSize(snapshots: BackupSnapshot[]): number {
    return snapshots.reduce((sum, snapshot) => sum + snapshot.size, 0)
}

function kindLabel(kind: BackupSnapshot['kind']): string {
    if (kind === 'automatic') return '자동'
    if (kind === 'beforeRestore') return '복원 전'
    return '수동'
}

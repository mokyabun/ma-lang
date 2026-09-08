import { ArrowClockwise, Code, Trash, Warning } from '@phosphor-icons/react'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import { SectionHeading } from '../../page-heading'
import { RequestDebugDetail } from './request-debug-detail'
import { RequestDebugList } from './request-debug-list'
import { useRequestDebug, type RequestDebugSectionProps } from './use-request-debug'

export function RequestDebugSection({ settings, onSettingsChange }: RequestDebugSectionProps) {
    const {
        requests,
        setSelectedId,
        loading,
        error,
        copied,
        clearOpen,
        setClearOpen,
        selected,
        refresh,
        toggleDebug,
        clearHistory,
        copy,
    } = useRequestDebug({ settings, onSettingsChange })
    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <div className="w-full">
                <SectionHeading className="mb-6 pr-12 [&_h2]:text-2xl" title="요청 디버그" />

                <section className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-y border-border py-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <strong className="text-sm">요청 기록</strong>
                            <span
                                className={cn(
                                    'font-mono text-[9px] uppercase tracking-wider',
                                    settings?.requestDebugEnabled
                                        ? 'text-primary'
                                        : 'text-muted-foreground',
                                )}
                            >
                                {settings?.requestDebugEnabled ? '기록 중' : '꺼짐'}
                            </span>
                        </div>
                        <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">
                            켠 이후 생성되는 요청만 기록합니다. 인증 키는 제외되지만 대화와 시스템
                            프롬프트가 포함되므로 필요한 동안만 사용하세요. 최근 100건을 보존합니다.
                        </p>
                    </div>
                    <Switch
                        checked={Boolean(settings?.requestDebugEnabled)}
                        onCheckedChange={(checked) => void toggleDebug(checked)}
                        aria-label="요청 디버그 기록"
                    />
                </section>

                {error ? (
                    <div className="mb-5 flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                        <Warning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        {error}
                    </div>
                ) : null}

                <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-muted-foreground">
                        기록된 요청 · {requests.length}건
                    </p>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                            <ArrowClockwise aria-hidden="true" /> 새로고침
                        </Button>
                        <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
                            <AlertDialogTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive"
                                        disabled={!requests.length}
                                    />
                                }
                            >
                                <Trash aria-hidden="true" /> 이력 비우기
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>요청 이력을 비울까요?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        저장된 디버그 요청 {requests.length}건을 영구 삭제합니다.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>취소</AlertDialogCancel>
                                    <AlertDialogAction
                                        variant="destructive"
                                        onClick={() => void clearHistory()}
                                    >
                                        모두 삭제
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>

                {loading ? (
                    <div className="grid min-h-72 place-items-center border border-border text-xs text-muted-foreground">
                        요청 이력을 불러오는 중
                    </div>
                ) : !requests.length ? (
                    <div className="grid min-h-72 place-items-center border border-dashed border-border px-6 text-center">
                        <div>
                            <Code className="mx-auto mb-3 size-6 text-muted-foreground" />
                            <p className="text-sm font-medium">기록된 요청이 없습니다.</p>
                            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                요청 디버그를 켠 뒤 채팅에서 응답을 한 번 생성하세요.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid min-h-[30rem] grid-cols-[17rem_minmax(0,1fr)] border border-border max-[760px]:grid-cols-1">
                        <RequestDebugList
                            requests={requests}
                            selectedId={selected?.id ?? null}
                            onSelect={setSelectedId}
                        />

                        {selected ? (
                            <RequestDebugDetail selected={selected} copied={copied} copy={copy} />
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    )
}

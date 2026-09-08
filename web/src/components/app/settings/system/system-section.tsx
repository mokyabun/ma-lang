import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SectionHeading } from '../../page-heading'
import { BackupSection } from '../backup/backup-section'
import type { SettingsPanelProps } from '../types'
import { RequestLogsPanel } from './request-logs-panel'
import { SystemLogsPanel } from './system-logs-panel'
import { UsagePanel } from './usage-panel'

type SystemPage = 'snapshots' | 'logs' | 'requests' | 'usage'

const pages: Array<{ id: SystemPage; label: string }> = [
    { id: 'snapshots', label: '스냅샷' },
    { id: 'logs', label: '시스템 로그' },
    { id: 'requests', label: '리퀘스트 로그' },
    { id: 'usage', label: '사용량' },
]

export function SystemSection({
    settings,
    onSettingsChange,
}: Pick<SettingsPanelProps, 'settings' | 'onSettingsChange'>) {
    const [page, setPage] = useState<SystemPage>('snapshots')

    return (
        <div className="h-full overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4">
            <SectionHeading className="mb-0 pr-12 [&_h2]:text-2xl" title="시스템" />
            <nav
                aria-label="시스템 페이지"
                className="mb-6 flex min-w-0 gap-1 overflow-x-auto border-b border-border"
            >
                {pages.map((item) => (
                    <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        aria-current={page === item.id ? 'page' : undefined}
                        className={cn(
                            'relative h-12 shrink-0 rounded-none px-4 text-muted-foreground hover:bg-transparent hover:text-foreground',
                            page === item.id &&
                                'font-semibold text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary',
                        )}
                        onClick={() => setPage(item.id)}
                    >
                        {item.label}
                    </Button>
                ))}
            </nav>

            {page === 'snapshots' && (
                <BackupSection embedded settings={settings} onSettingsChange={onSettingsChange} />
            )}
            {page === 'logs' && <SystemLogsPanel />}
            {page === 'requests' && <RequestLogsPanel />}
            {page === 'usage' && <UsagePanel />}
        </div>
    )
}

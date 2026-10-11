import { CheckCircle, WarningCircle } from '@phosphor-icons/react'

import { Alert, AlertDescription } from '@/components/ui/alert'

export type Notice = { tone: 'success' | 'error'; text: string } | null

export function NoticeBox({ notice }: { notice: Notice }) {
    return notice ? (
        <Alert variant={notice.tone === 'error' ? 'destructive' : 'default'}>
            {notice.tone === 'success' ? <CheckCircle /> : <WarningCircle />}
            <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
    ) : null
}

import type { Message } from '@malang/shared'

export function formatClock(value: string): string {
    return new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
}

export function statusLabel(status: Message['status']): string {
    if (status === 'streaming') return '작성 중'
    if (status === 'cancelled') return '중단됨'
    if (status === 'failed') return '실패'
    return '완료'
}

export function relativeTime(value: string): string {
    const difference = Date.now() - new Date(value).getTime()
    const minutes = Math.floor(difference / 60_000)
    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    return `${days}일 전`
}

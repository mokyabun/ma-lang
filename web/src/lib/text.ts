export function initials(value: string): string {
    return value.trim().slice(0, 2).toLocaleUpperCase() || '?'
}

export function formatBytes(value: number) {
    if (value < 1_024) return `${value} B`
    if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KiB`
    return `${(value / 1_048_576).toFixed(1)} MiB`
}

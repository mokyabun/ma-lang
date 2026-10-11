export function replaceAt<T>(values: T[], index: number, value: T): T[] {
    const next = [...values]
    next[index] = value
    return next
}

export function removeAt<T>(values: T[], index: number): T[] {
    return values.filter((_, itemIndex) => itemIndex !== index)
}

export function splitList(value: string): string[] {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

export function splitLines(value: string): string[] {
    return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
}

export function nextVariableKey(variables: Record<string, string>): string {
    let index = Object.keys(variables).length + 1
    while (`variable_${index}` in variables) index += 1
    return `variable_${index}`
}

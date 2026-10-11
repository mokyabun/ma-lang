import { ProviderError } from './types'

export async function* parseSse(
    stream: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event?: string; data: string }> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')
            while (true) {
                const end = buffer.indexOf('\n\n')
                if (end < 0) break
                const block = buffer.slice(0, end)
                buffer = buffer.slice(end + 2)
                const parsed = parseBlock(block)
                if (parsed) yield parsed
            }
        }
        buffer += decoder.decode()
        const parsed = parseBlock(buffer)
        if (parsed) yield parsed
    } finally {
        reader.releaseLock()
    }
}

export function jsonObject(value: string, provider: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(value) as unknown
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
        // Mapped to the stable provider error below.
    }
    throw new ProviderError(
        'invalid_provider_response',
        `${provider} returned malformed streaming JSON`,
    )
}

export function endpoint(baseUrl: string, suffix: string): string {
    const base = baseUrl.replace(/\/+$/, '')
    if (base.endsWith(suffix)) return base
    return `${base}${suffix.startsWith('/') ? '' : '/'}${suffix}`
}

function parseBlock(block: string): { event?: string; data: string } | null {
    let event: string | undefined
    const data: string[] = []
    for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    }
    return data.length ? { event, data: data.join('\n') } : null
}

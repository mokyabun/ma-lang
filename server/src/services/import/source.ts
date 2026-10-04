/** Random-access view over import bytes, backed by memory or by an uploaded temp file. */
export interface ByteSource {
    readonly size: number
    read(offset: number, length: number): Promise<Uint8Array>
}

/** An imported asset whose bytes are read only when it is persisted. */
export interface LazyAsset {
    read(): Promise<Uint8Array>
    mimeType: string
    type: string
    name: string
    extension: string
    sourceUri: string
}

export type ImportProgress = (
    event: { stage: 'reading' } | { stage: 'assets'; done: number; total: number },
) => void

export function bufferSource(bytes: Uint8Array): ByteSource {
    return {
        size: bytes.byteLength,
        read: async (offset, length) => {
            assertRange(offset, length, bytes.byteLength)
            return bytes.subarray(offset, offset + length)
        },
    }
}

export function fileSource(path: string, size: number): ByteSource {
    const file = Bun.file(path)
    return {
        size,
        read: async (offset, length) => {
            assertRange(offset, length, size)
            const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer())
            if (bytes.byteLength !== length) throw new RangeError('Unexpected end of import file')
            return bytes
        },
    }
}

export function toByteSource(input: Uint8Array | ByteSource): ByteSource {
    return input instanceof Uint8Array ? bufferSource(input) : input
}

export function readAll(source: ByteSource): Promise<Uint8Array> {
    return source.read(0, source.size)
}

function assertRange(offset: number, length: number, size: number) {
    if (offset < 0 || length < 0 || offset + length > size) {
        throw new RangeError('Read is outside the import file')
    }
}

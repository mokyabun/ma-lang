import { Inflate } from 'fflate'

import type { ByteSource } from './source'

// Random-access ZIP reader: reads the central directory first, then extracts entries one at a time.

export class ZipFormatError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ZipFormatError'
    }
}

export interface ZipEntry {
    name: string
    /** Compression method: 0 = stored, 8 = deflate. */
    method: number
    flags: number
    compressedSize: number
    size: number
    localHeaderOffset: number
}

const EOCD_SIGNATURE = 0x06054b50
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const ZIP64_EOCD_SIGNATURE = 0x06064b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const EOCD_SIZE = 22
const MAX_COMMENT_SIZE = 0xffff
const INFLATE_CHUNK_BYTES = 1024 * 1024

const utf8 = new TextDecoder()

export async function readZipDirectory(source: ByteSource): Promise<ZipEntry[]> {
    const tailSize = Math.min(source.size, EOCD_SIZE + MAX_COMMENT_SIZE)
    const tailOffset = source.size - tailSize
    const tail = await source.read(tailOffset, tailSize)
    const tailView = view(tail)

    let eocd = -1
    for (let index = tail.length - EOCD_SIZE; index >= 0; index -= 1) {
        if (tailView.getUint32(index, true) === EOCD_SIGNATURE) {
            eocd = index
            break
        }
    }
    if (eocd < 0) throw new ZipFormatError('ZIP end of central directory not found')

    let entryCount = tailView.getUint16(eocd + 10, true)
    let directorySize = tailView.getUint32(eocd + 12, true)
    let directoryOffset = tailView.getUint32(eocd + 16, true)

    if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
        const locatorOffset = tailOffset + eocd - 20
        if (locatorOffset < 0) throw new ZipFormatError('ZIP64 locator not found')
        const locator = view(await source.read(locatorOffset, 20))
        if (locator.getUint32(0, true) !== ZIP64_LOCATOR_SIGNATURE)
            throw new ZipFormatError('ZIP64 locator not found')
        const zip64Offset = uint64(locator, 8)
        if (zip64Offset + 56 > source.size) throw new ZipFormatError('Invalid ZIP64 record')
        const zip64 = view(await source.read(zip64Offset, 56))
        if (zip64.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE)
            throw new ZipFormatError('Invalid ZIP64 record')
        entryCount = uint64(zip64, 32)
        directorySize = uint64(zip64, 40)
        directoryOffset = uint64(zip64, 48)
    }

    if (directoryOffset + directorySize > source.size)
        throw new ZipFormatError('ZIP central directory is out of range')

    const directory = await source.read(directoryOffset, directorySize)
    const directoryView = view(directory)
    const entries: ZipEntry[] = []
    let offset = 0
    for (let index = 0; index < entryCount; index += 1) {
        if (
            offset + 46 > directory.length ||
            directoryView.getUint32(offset, true) !== CENTRAL_SIGNATURE
        )
            throw new ZipFormatError('Invalid ZIP central directory entry')
        const flags = directoryView.getUint16(offset + 8, true)
        const method = directoryView.getUint16(offset + 10, true)
        let compressedSize = directoryView.getUint32(offset + 20, true)
        let size = directoryView.getUint32(offset + 24, true)
        const nameLength = directoryView.getUint16(offset + 28, true)
        const extraLength = directoryView.getUint16(offset + 30, true)
        const commentLength = directoryView.getUint16(offset + 32, true)
        let localHeaderOffset = directoryView.getUint32(offset + 42, true)
        const nameStart = offset + 46
        const extraStart = nameStart + nameLength
        const next = extraStart + extraLength + commentLength
        if (next > directory.length) throw new ZipFormatError('Invalid ZIP central directory entry')

        // ZIP64 extended information: only the fields saturated in the record are present.
        let extra = extraStart
        while (extra + 4 <= extraStart + extraLength) {
            const id = directoryView.getUint16(extra, true)
            const length = directoryView.getUint16(extra + 2, true)
            if (id === 0x0001) {
                let field = extra + 4
                const next64 = () => {
                    const value = uint64(directoryView, field)
                    field += 8
                    return value
                }
                if (size === 0xffffffff) size = next64()
                if (compressedSize === 0xffffffff) compressedSize = next64()
                if (localHeaderOffset === 0xffffffff) localHeaderOffset = next64()
                break
            }
            extra += 4 + length
        }

        const nameBytes = directory.subarray(nameStart, extraStart)
        entries.push({
            // Mirrors fflate: names are UTF-8 only when the language-encoding flag is set.
            name: flags & 0x800 ? utf8.decode(nameBytes) : latin1(nameBytes),
            method,
            flags,
            compressedSize,
            size,
            localHeaderOffset,
        })
        offset = next
    }
    return entries
}

export async function readZipEntry(source: ByteSource, entry: ZipEntry): Promise<Uint8Array> {
    if (entry.flags & 0x1) throw new ZipFormatError(`Encrypted ZIP entry: ${entry.name}`)
    if (entry.localHeaderOffset + 30 > source.size)
        throw new ZipFormatError(`ZIP entry is out of range: ${entry.name}`)
    const header = view(await source.read(entry.localHeaderOffset, 30))
    if (header.getUint32(0, true) !== LOCAL_SIGNATURE)
        throw new ZipFormatError(`Invalid ZIP local header: ${entry.name}`)
    const dataOffset =
        entry.localHeaderOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
    if (dataOffset + entry.compressedSize > source.size)
        throw new ZipFormatError(`ZIP entry is out of range: ${entry.name}`)
    const data = await source.read(dataOffset, entry.compressedSize)

    if (entry.method === 0) {
        if (entry.compressedSize !== entry.size)
            throw new ZipFormatError(`ZIP entry size mismatch: ${entry.name}`)
        return data
    }
    if (entry.method === 8) return inflateBounded(data, entry.size, entry.name)
    throw new ZipFormatError(`Unsupported ZIP compression method ${entry.method}: ${entry.name}`)
}

// Aborts past the declared size, so a lying central directory cannot become a zip bomb.
function inflateBounded(data: Uint8Array, size: number, name: string): Uint8Array {
    const output = new Uint8Array(size)
    let written = 0
    const inflater = new Inflate((chunk) => {
        if (written + chunk.length > size)
            throw new ZipFormatError(`ZIP entry is larger than declared: ${name}`)
        output.set(chunk, written)
        written += chunk.length
    })
    try {
        if (data.length === 0) inflater.push(data, true)
        for (let offset = 0; offset < data.length; offset += INFLATE_CHUNK_BYTES) {
            const end = Math.min(offset + INFLATE_CHUNK_BYTES, data.length)
            inflater.push(data.subarray(offset, end), end === data.length)
        }
    } catch (error) {
        if (error instanceof ZipFormatError) throw error
        throw new ZipFormatError(`Invalid deflate data: ${name}`)
    }
    if (written !== size) throw new ZipFormatError(`ZIP entry size mismatch: ${name}`)
    return output
}

function latin1(bytes: Uint8Array): string {
    let value = ''
    for (const byte of bytes) value += String.fromCharCode(byte)
    return value
}

function view(bytes: Uint8Array): DataView {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function uint64(data: DataView, offset: number): number {
    const value = data.getBigUint64(offset, true)
    if (value > BigInt(Number.MAX_SAFE_INTEGER))
        throw new ZipFormatError('ZIP64 value is too large')
    return Number(value)
}

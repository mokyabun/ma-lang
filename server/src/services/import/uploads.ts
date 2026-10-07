import { mkdirSync, rmSync } from 'node:fs'
import { type FileHandle, open, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { ConflictError, NotFoundError, PayloadTooLargeError, ValidationError } from '@/errors'

import { type ByteSource, fileSource } from './source'

export interface Upload {
    filename: string
    size: number
    source: ByteSource
    dispose(): Promise<void>
}

interface UploadSession {
    filename: string
    size: number
    chunkCount: number
    path: string
    handle: FileHandle
    received: Set<number>
    touchedAt: number
}

const SESSION_IDLE_MS = 60 * 60 * 1000
const MAX_SESSIONS = 8

/**
 * Spools uploads to DATA_DIR/tmp/uploads (cleared on startup). Each chunk is written at its own
 * offset, so chunks may arrive out of order, in parallel or retried.
 */
export class UploadStore {
    private readonly directory: string
    private readonly sessions = new Map<string, UploadSession>()

    constructor(
        dataDir: string,
        private readonly chunkBytes: number,
    ) {
        this.directory = join(dataDir, 'tmp', 'uploads')
        rmSync(this.directory, { recursive: true, force: true })
        mkdirSync(this.directory, { recursive: true })
    }

    async create(filename: string, size: number, maxBytes: number) {
        if (size > maxBytes)
            throw new PayloadTooLargeError('Import file is too large', { maxBytes })
        await this.sweep()
        if (this.sessions.size >= MAX_SESSIONS)
            throw new ConflictError('Too many uploads are in progress')
        const id = crypto.randomUUID()
        const path = join(this.directory, id)
        const chunkCount = Math.ceil(size / this.chunkBytes)
        const handle = await open(path, 'w')
        this.sessions.set(id, {
            filename,
            size,
            chunkCount,
            path,
            handle,
            received: new Set(),
            touchedAt: Date.now(),
        })
        return { id, chunkBytes: this.chunkBytes, chunkCount }
    }

    async writeChunk(id: string, index: number, request: Request) {
        const session = this.session(id)
        if (!Number.isInteger(index) || index < 0 || index >= session.chunkCount)
            throw new ValidationError('Invalid upload chunk index')
        const offset = index * this.chunkBytes
        const expected = Math.min(this.chunkBytes, session.size - offset)
        if (Number(request.headers.get('content-length') ?? 0) > expected)
            throw new PayloadTooLargeError(`Upload chunk must be ${expected} bytes`)
        const bytes = new Uint8Array(await request.arrayBuffer())
        if (bytes.byteLength !== expected)
            throw new ValidationError(`Upload chunk must be ${expected} bytes`)
        session.touchedAt = Date.now()
        await session.handle.write(bytes, 0, bytes.byteLength, offset)
        session.received.add(index)
        return { received: session.received.size, chunkCount: session.chunkCount }
    }

    /** Hands a completed chunked upload to an import; the caller disposes it afterwards. */
    async take(id: string, maxBytes: number): Promise<Upload> {
        const session = this.session(id)
        if (session.size > maxBytes) throw new PayloadTooLargeError('Import file is too large')
        if (session.received.size !== session.chunkCount)
            throw new ValidationError('Upload is incomplete')
        this.sessions.delete(id)
        await session.handle.close()
        return {
            filename: session.filename,
            size: session.size,
            source: fileSource(session.path, session.size),
            dispose: () => rm(session.path, { force: true }),
        }
    }

    async cancel(id: string) {
        const session = this.sessions.get(id)
        if (!session) return
        this.sessions.delete(id)
        await session.handle.close().catch(() => {})
        await rm(session.path, { force: true })
    }

    private session(id: string): UploadSession {
        const session = this.sessions.get(id)
        if (!session) throw new NotFoundError('Upload not found')
        return session
    }

    private async sweep() {
        const cutoff = Date.now() - SESSION_IDLE_MS
        for (const [id, session] of this.sessions) {
            if (session.touchedAt < cutoff) await this.cancel(id)
        }
    }

    async receive(request: Request, maxBytes: number): Promise<Upload> {
        const contentLength = Number(request.headers.get('content-length') ?? 0)
        if (contentLength > maxBytes) throw new PayloadTooLargeError('Import file is too large')

        const path = join(this.directory, crypto.randomUUID())
        const dispose = () => rm(path, { force: true })
        try {
            const contentType = request.headers.get('content-type') ?? ''
            const { filename, size } = contentType.includes('multipart/form-data')
                ? await this.writeMultipart(request, path, maxBytes)
                : await this.writeRaw(request, path, maxBytes)
            return { filename, size, source: fileSource(path, size), dispose }
        } catch (error) {
            await dispose()
            throw error
        }
    }

    private async writeMultipart(request: Request, path: string, maxBytes: number) {
        const form = await request.formData().catch(() => {
            throw new ValidationError('Malformed multipart form data')
        })
        const file = form.get('file')
        if (!(file instanceof File)) throw new ValidationError('Multipart field "file" is required')
        if (file.size > maxBytes) throw new PayloadTooLargeError('Import file is too large')
        await Bun.write(path, file)
        return { filename: file.name || 'import.json', size: file.size }
    }

    private async writeRaw(request: Request, path: string, maxBytes: number) {
        const writer = Bun.file(path).writer()
        let size = 0
        try {
            if (request.body) {
                for await (const chunk of request.body) {
                    size += chunk.byteLength
                    if (size > maxBytes) throw new PayloadTooLargeError('Import file is too large')
                    await writer.write(chunk)
                }
            }
        } finally {
            await writer.end()
        }
        return {
            filename: decodeFilename(request.headers.get('x-filename')) ?? 'import.json',
            size,
        }
    }
}

// Raw-body uploads send the filename URI-encoded because header values must be ISO-8859-1.
export function decodeFilename(value: string | null | undefined): string | undefined {
    if (!value) return undefined
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

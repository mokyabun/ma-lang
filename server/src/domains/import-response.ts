import type { ImportEvent } from '@malang/shared'
import type { Context } from 'hono'

import { normalizeError, statusForErrorKind } from '@/errors'
import type { AppContext } from '@/services'
import type { ImportProgress } from '@/services/import/source'
import type { Upload } from '@/services/import/uploads'
import type { AppEnv } from '@/utils'

const encoder = new TextEncoder()

/** Imports a chunked upload (`x-upload-id`) or the spooled body; SSE clients get progress events. */
export async function respondToImport<T>(
    c: Context<AppEnv>,
    context: AppContext,
    maxBytes: number,
    run: (upload: Upload, onProgress: ImportProgress) => Promise<T>,
    status: 200 | 201 = 201,
): Promise<Response> {
    const uploadId = c.req.header('x-upload-id')
    const upload = uploadId
        ? await context.uploads.take(uploadId, maxBytes)
        : await context.uploads.receive(c.req.raw, maxBytes)

    if (!c.req.header('accept')?.includes('text/event-stream')) {
        try {
            return c.json(await run(upload, () => {}), status)
        } finally {
            await upload.dispose()
        }
    }

    const requestId = c.get('requestId')
    const log = context.logger.child({ module: 'import' })
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let open = true
            const send = (event: ImportEvent<T>) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
                } catch {
                    // Client went away; keep importing so the result is saved.
                    open = false
                }
            }
            try {
                send({ type: 'import.progress', stage: 'reading' })
                const result = await run(upload, (progress) =>
                    send({ type: 'import.progress', ...progress }),
                )
                send({ type: 'import.completed', status, result })
            } catch (error) {
                const normalized = normalizeError(error, requestId)
                if (normalized.unexpected) {
                    log.error(
                        { event: 'import.failed', requestId, err: normalized.cause },
                        'Import failed',
                    )
                }
                send({
                    type: 'import.failed',
                    status: statusForErrorKind(normalized.kind),
                    error: normalized.apiError,
                })
            } finally {
                await upload.dispose()
                if (open) controller.close()
            }
        },
    })
    return new Response(stream, {
        headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            // Disable nginx buffering so progress events stream.
            'x-accel-buffering': 'no',
            'x-request-id': requestId,
        },
    })
}

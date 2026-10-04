import type { ImportEvent } from '@malang/shared'
import type { Context } from 'hono'

import { normalizeError, statusForErrorKind } from '@/errors'
import type { AppContext } from '@/services'
import type { ImportProgress } from '@/services/import/source'
import type { Upload } from '@/services/import/uploads'
import type { AppEnv } from '@/utils'

const encoder = new TextEncoder()

/**
 * Runs an import from a completed chunked upload (`x-upload-id`) or from the request body, which
 * is spooled to a temp file. Clients that accept
 * `text/event-stream` receive progress events (asset X/Y) followed by the result; others get a
 * plain JSON response as before.
 */
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
                    // The client went away; keep importing so the result is still saved.
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
            // Ask nginx not to buffer, so progress events reach the client as they happen.
            'x-accel-buffering': 'no',
            'x-request-id': requestId,
        },
    })
}

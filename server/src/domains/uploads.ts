import { Hono } from 'hono'
import { z } from 'zod'

import type { AppContext } from '@/services'
import { type AppEnv, jsonValidator } from '@/utils'

const UploadCreateBody = z.object({
    filename: z.string().min(1).max(512),
    size: z.number().int().nonnegative(),
})

/** Chunked upload sessions; a completed upload is passed to an import via `x-upload-id`. */
export function createUploadDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .post('/', jsonValidator(UploadCreateBody), async (c) => {
            const { filename, size } = c.req.valid('json')
            return c.json(
                await context.uploads.create(filename, size, context.config.limits.importBytes),
                201,
            )
        })
        .put('/:id/chunks/:index', async (c) =>
            c.json(
                await context.uploads.writeChunk(
                    c.req.param('id'),
                    Number(c.req.param('index')),
                    c.req.raw,
                ),
            ),
        )
        .delete('/:id', async (c) => {
            await context.uploads.cancel(c.req.param('id'))
            return c.body(null, 204)
        })
}

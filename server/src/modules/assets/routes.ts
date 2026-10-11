import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { NotFoundError } from '@/lib/errors'
import type { AppEnv } from '@/lib/http'

export function createAssetRoutes(context: AppContext) {
    return new Hono<AppEnv>().get('/:id', async (c) => {
        const asset = context.assets.get(c.req.param('id'))
        const bytes = asset ? await context.assets.read(asset.id) : null
        if (!asset || !bytes) throw new NotFoundError('Asset not found')

        return new Response(bytes, {
            headers: {
                'content-type': asset.mimeType,
                'content-length': String(asset.size),
            },
        })
    })
}

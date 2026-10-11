import { createMiddleware } from 'hono/factory'

import { ForbiddenError } from '@/lib/errors'
import type { AppEnv } from '@/lib/http'

export function originMiddleware(allowedOrigins: ReadonlySet<string>) {
    return createMiddleware<AppEnv>(async (c, next) => {
        const origin = c.req.header('origin')

        if (origin && allowedOrigins.has(origin)) {
            c.header('access-control-allow-origin', origin)
            c.header('access-control-allow-credentials', 'true')
            c.header('vary', 'Origin')
        }
        if (c.req.method === 'OPTIONS') {
            if (origin && !allowedOrigins.has(origin)) {
                throw new ForbiddenError('Origin is not allowed')
            }
            c.header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
            c.header(
                'access-control-allow-headers',
                'content-type,x-request-id,x-filename,x-upload-id',
            )
            return c.body(null, 204)
        }
        if (
            !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
            origin &&
            !allowedOrigins.has(origin)
        ) {
            throw new ForbiddenError('Origin is not allowed')
        }

        await next()
    })
}

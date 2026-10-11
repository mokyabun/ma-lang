import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'

import type { AppContext } from '@/context'
import { UnauthorizedError } from '@/lib/errors'
import type { AppEnv } from '@/lib/http'
import { SESSION_COOKIE } from '@/modules/auth/routes'

export function sessionMiddleware(context: AppContext) {
    return createMiddleware<AppEnv>(async (c, next) => {
        const path = new URL(c.req.url).pathname
        if (path === '/api/v1/auth/login') {
            return next()
        }

        const token = getCookie(c, SESSION_COOKIE)
        const session = token ? await context.auth.authenticate(token) : null
        if (!session) throw new UnauthorizedError('Authentication is required')

        c.set('adminId', session.adminId)
        await next()
    })
}

import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { NotFoundError } from '@/lib/errors'
import type { AppEnv } from '@/lib/http'

export function createDebugRoutes(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/system-logs', (c) => c.json({ logs: context.systemLogs.list() }))
        .delete('/system-logs', (c) => c.json({ deleted: context.systemLogs.clear() }))
        .get('/request-logs', (c) => c.json({ requests: context.debug.requestLogs() }))
        .delete('/request-logs', (c) => c.json(context.debug.clearRequestLogs()))
        .get('/request-logs/usage', (c) => c.json(context.debug.usage()))
        .get('/request-logs/:id', (c) => {
            const request = context.debug.requestLog(c.req.param('id'))
            if (!request) throw new NotFoundError('Request log does not exist')
            return c.json(request)
        })
        .get('/requests', (c) => c.json({ requests: context.debug.listRequests() }))
        .delete('/requests', (c) => c.json({ deleted: context.debug.clearRequests() }))
}

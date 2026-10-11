import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { NotFoundError } from '@/lib/errors'
import type { AppEnv } from '@/lib/http'

export function createDebugDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/system-logs', (c) => c.json({ logs: context.systemLogs.list() }))
        .delete('/system-logs', (c) => c.json({ deleted: context.systemLogs.clear() }))
        .get('/request-logs', (c) =>
            c.json({
                requests: context.store.generation.requestLogs(
                    context.systemLogs.requestLogCutoff(),
                ),
            }),
        )
        .delete('/request-logs', (c) => {
            const deletedDetails = context.store.requestDebug.clear()
            const cutoff = context.systemLogs.clearRequestLogs(
                context.store.generation.requestLogCursor(),
            )
            return c.json({ deletedDetails, cutoff })
        })
        .get('/request-logs/usage', (c) => c.json(context.store.generation.usage()))
        .get('/request-logs/:id', (c) => {
            const request = context.store.generation.requestLogDetail(c.req.param('id'))
            if (!request) throw new NotFoundError('Request log does not exist')
            return c.json(request)
        })
        .get('/requests', (c) => c.json({ requests: context.store.requestDebug.list() }))
        .delete('/requests', (c) => {
            const deleted = context.store.requestDebug.clear()
            return c.json({ deleted })
        })
}

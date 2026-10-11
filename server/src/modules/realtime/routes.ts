import { Hono } from 'hono'
import { z } from 'zod'

import type { AppContext } from '@/context'
import type { AppEnv } from '@/lib/http'

export function createRealtimeRoutes(context: AppContext) {
    return new Hono<AppEnv>().get('/events', (c) => {
        const clientInstanceId = z.uuid().parse(c.req.query('clientInstanceId'))
        return new Response(context.events.subscribe(clientInstanceId), {
            headers: {
                'content-type': 'text/event-stream; charset=utf-8',
                'cache-control': 'no-cache, no-transform',
                connection: 'keep-alive',
            },
        })
    })
}

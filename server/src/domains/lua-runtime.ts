import { LuaRemoteCommandResultSchema, LuaTriggerRequestSchema } from '@malang/shared'
import { Hono } from 'hono'
import { z } from 'zod'

import { ForbiddenError, NotFoundError } from '@/errors'
import type { AppContext } from '@/services'
import { type AppEnv, jsonValidator } from '@/utils'

export function createConversationLuaDomain(context: AppContext) {
    return new Hono<AppEnv>().post(
        '/:id/lua/trigger',
        jsonValidator(LuaTriggerRequestSchema),
        async (c) => {
            const conversationId = c.req.param('id')
            if (!context.store.conversation.get(conversationId)) {
                throw new NotFoundError('Conversation not found')
            }
            return c.json(await context.lua.trigger(conversationId, c.req.valid('json')))
        },
    )
}

export function createRuntimeDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/events', (c) => {
            const clientInstanceId = z.uuid().parse(c.req.query('clientInstanceId'))
            return new Response(context.events.subscribe(clientInstanceId), {
                headers: {
                    'content-type': 'text/event-stream; charset=utf-8',
                    'cache-control': 'no-cache, no-transform',
                    connection: 'keep-alive',
                },
            })
        })
        .post('/commands/:commandId/result', jsonValidator(LuaRemoteCommandResultSchema), (c) => {
            const result = context.lua.remote.resolve(c.req.param('commandId'), c.req.valid('json'))
            if (result === 'not_found') throw new NotFoundError('Runtime command not found')
            if (result === 'forbidden')
                throw new ForbiddenError('Runtime command belongs to another client')
            return c.json({ ok: true })
        })
}

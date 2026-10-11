import { LuaRemoteCommandResultSchema, LuaTriggerRequestSchema } from '@malang/shared'
import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { type AppEnv, jsonValidator } from '@/lib/http'

export function createConversationLuaRoutes(context: AppContext) {
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

export function createLuaRuntimeRoutes(context: AppContext) {
    return new Hono<AppEnv>().post(
        '/commands/:commandId/result',
        jsonValidator(LuaRemoteCommandResultSchema),
        (c) => {
            const result = context.lua.remote.resolve(c.req.param('commandId'), c.req.valid('json'))
            if (result === 'not_found') throw new NotFoundError('Runtime command not found')
            if (result === 'forbidden')
                throw new ForbiddenError('Runtime command belongs to another client')
            return c.json({ ok: true })
        },
    )
}

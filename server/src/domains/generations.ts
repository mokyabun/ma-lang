import { GenerationRequestSchema } from '@malang/shared'
import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { NotFoundError } from '@/lib/errors'
import { type AppEnv, jsonValidator } from '@/lib/http'

export function createConversationGenerationDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .post('/:id/prompt-preview', async (c) => {
            requireConversation(context, c.req.param('id'))
            return c.json(await context.generations.preview(c.req.param('id')))
        })
        .post('/:id/generations', jsonValidator(GenerationRequestSchema), async (c) => {
            requireConversation(context, c.req.param('id'))
            const result = await context.generations.start(
                c.req.param('id'),
                c.req.valid('json'),
                c.get('requestId'),
            )

            return new Response(result.stream, {
                headers: {
                    'content-type': 'text/event-stream; charset=utf-8',
                    'cache-control': 'no-cache, no-transform',
                    connection: 'keep-alive',
                    'x-generation-id': result.generationId,
                },
            })
        })
}

export function createGenerationDomain(context: AppContext) {
    return new Hono<AppEnv>().delete('/:id', (c) => {
        if (!context.generations.cancel(c.req.param('id'))) {
            throw new NotFoundError('Active generation not found')
        }
        return c.body(null, 204)
    })
}

function requireConversation(context: AppContext, id: string) {
    if (!context.store.conversation.get(id)) {
        throw new NotFoundError('Conversation not found')
    }
}

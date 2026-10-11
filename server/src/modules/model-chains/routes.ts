import { ModelChainPresetInputSchema } from '@malang/shared'
import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { ConflictError, NotFoundError } from '@/lib/errors'
import { type AppEnv, jsonValidator } from '@/lib/http'

export function createModelChainRoutes(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) => c.json({ presets: context.modelChains.list() }))
        .post('/', jsonValidator(ModelChainPresetInputSchema), (c) =>
            c.json(context.modelChains.create(c.req.valid('json')), 201),
        )
        .put('/:id', jsonValidator(ModelChainPresetInputSchema), (c) => {
            const preset = context.modelChains.update(c.req.param('id'), c.req.valid('json'))
            if (!preset) throw new NotFoundError('Model chain preset not found')
            return c.json(preset)
        })
        .delete('/:id', (c) => {
            const result = context.modelChains.delete(c.req.param('id'))
            if (result === 'not_found') throw new NotFoundError('Model chain preset not found')
            if (result === 'in_use') {
                throw new ConflictError('Model chain preset is in use by a conversation')
            }
            return c.body(null, 204)
        })
}

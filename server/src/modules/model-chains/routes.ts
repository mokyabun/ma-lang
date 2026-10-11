import { ModelChainPresetInputSchema, type ModelChainPresetInput } from '@malang/shared'
import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors'
import { type AppEnv, jsonValidator } from '@/lib/http'

export function createModelChainRoutes(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) => c.json({ presets: context.store.modelChain.list() }))
        .post('/', jsonValidator(ModelChainPresetInputSchema), (c) => {
            const input = c.req.valid('json')
            validateStepModels(context, input)
            return c.json(context.store.modelChain.create(input), 201)
        })
        .put('/:id', jsonValidator(ModelChainPresetInputSchema), (c) => {
            const input = c.req.valid('json')
            validateStepModels(context, input)
            const preset = context.store.modelChain.update(c.req.param('id'), input)
            if (!preset) throw new NotFoundError('Model chain preset not found')
            return c.json(preset)
        })
        .delete('/:id', (c) => {
            const result = context.store.modelChain.delete(c.req.param('id'))
            if (result === 'not_found') throw new NotFoundError('Model chain preset not found')
            if (result === 'in_use') {
                throw new ConflictError('Model chain preset is in use by a conversation')
            }
            return c.body(null, 204)
        })
}

function validateStepModels(context: AppContext, input: ModelChainPresetInput) {
    const missing = input.layers
        .flatMap((layer) => layer.agents)
        .find((agent) => !context.providers.getModelPreset(agent.modelPresetId))
    if (missing) {
        throw new ValidationError(`Model preset for agent “${missing.name}” does not exist`)
    }
}

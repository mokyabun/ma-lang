import { PersonaCreateSchema, PersonaUpdateSchema } from '@malang/shared'
import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { NotFoundError } from '@/lib/errors'
import { type AppEnv, jsonValidator, readImportFile } from '@/lib/http'

export function createPersonaDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) => c.json({ personas: context.personas.list() }))
        .post('/', jsonValidator(PersonaCreateSchema), (c) =>
            c.json(context.personas.create(c.req.valid('json')), 201),
        )
        .put('/:id/avatar', async (c) => {
            const file = await readImportFile(c, context.config.limits.assetBytes)
            const persona = await context.personas.setAvatar(
                c.req.param('id'),
                file.bytes,
                file.mimeType,
            )
            if (!persona) throw new NotFoundError('Persona not found')
            return c.json(persona)
        })
        .delete('/:id/avatar', (c) => {
            const persona = context.personas.removeAvatar(c.req.param('id'))
            if (!persona) throw new NotFoundError('Persona not found')
            return c.json(persona)
        })
        .get('/:id', (c) => {
            const persona = context.personas.get(c.req.param('id'))
            if (!persona) throw new NotFoundError('Persona not found')
            return c.json(persona)
        })
        .patch('/:id', jsonValidator(PersonaUpdateSchema), (c) => {
            const persona = context.personas.update(c.req.param('id'), c.req.valid('json'))
            if (!persona) throw new NotFoundError('Persona not found')
            return c.json(persona)
        })
        .delete('/:id', (c) => {
            if (!context.personas.delete(c.req.param('id'))) {
                throw new NotFoundError('Persona not found')
            }
            return c.body(null, 204)
        })
}

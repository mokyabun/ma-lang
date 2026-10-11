import { AppSettingsPatchSchema } from '@malang/shared'
import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { type AppEnv, jsonValidator } from '@/lib/http'

export function createSettingsRoutes(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) => c.json(context.store.settings.get()))
        .get('/backup', (c) => c.json({ allowed: context.config.autoBackupEnabled }))
        .get('/backups', (c) => c.json({ snapshots: context.backups.list() }))
        .post('/backups', (c) => c.json(context.backups.create(), 201))
        .post('/backups/:id/restore', (c) => c.json(context.backups.restore(c.req.param('id'))))
        .delete('/backups/:id', (c) => {
            if (!context.backups.delete(c.req.param('id'))) {
                throw new NotFoundError('Snapshot does not exist')
            }
            return c.body(null, 204)
        })
        .get('/backups/:id/download', (c) => {
            const id = c.req.param('id')
            const path = context.backups.file(id)
            if (!path) throw new NotFoundError('Snapshot does not exist')
            return new Response(Bun.file(path), {
                headers: {
                    'cache-control': 'private, no-store',
                    'content-disposition': `attachment; filename="${id}"`,
                    'content-type': 'application/vnd.sqlite3',
                },
            })
        })
        .patch('/', jsonValidator(AppSettingsPatchSchema), (c) => {
            const body = c.req.valid('json')
            if (body.defaultPromptPresetId && !context.prompts.get(body.defaultPromptPresetId)) {
                throw new ValidationError('Default prompt preset does not exist')
            }
            if (body.selectedPersonaId && !context.personas.get(body.selectedPersonaId)) {
                throw new ValidationError('Persona does not exist')
            }
            if (
                body.defaultModelPresetId &&
                !context.providers.getModelPreset(body.defaultModelPresetId)
            ) {
                throw new ValidationError('Default model preset does not exist')
            }
            if (
                body.defaultAuxiliaryModelPresetId &&
                !context.providers.getModelPreset(body.defaultAuxiliaryModelPresetId)
            ) {
                throw new ValidationError('Default auxiliary model preset does not exist')
            }
            return c.json(context.store.settings.update(body))
        })
}

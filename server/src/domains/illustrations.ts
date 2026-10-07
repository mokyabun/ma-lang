import {
    ContinuityUpdateSchema,
    ConversationIllustrationSettingsInputSchema,
    IllustrationStateDefinitionCreateSchema,
    IllustrationStateDefinitionInputSchema,
    IllustrateMessageRequestSchema,
    IllustrationActorCreateSchema,
    IllustrationActorInputSchema,
    IllustrationActorOwnerSchema,
    IllustrationSettingsPatchSchema,
    IllustrationStyleInputSchema,
    IllustrationStyleTestRequestSchema,
    IllustrationTestRequestSchema,
} from '@malang/shared'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AppContext } from '@/services'
import { type AppEnv, jsonValidator, queryValidator } from '@/utils'

const StateDefinitionScopeSchema = z.object({ characterId: z.uuid().optional() })

export function createIllustrationDomain(context: AppContext) {
    const catalog = context.illustrationCatalog
    return new Hono<AppEnv>()
        .get('/settings', (c) => c.json(context.illustrations.settings()))
        .patch('/settings', jsonValidator(IllustrationSettingsPatchSchema), async (c) =>
            c.json(await context.illustrations.updateSettings(c.req.valid('json'))),
        )
        .post('/test', jsonValidator(IllustrationTestRequestSchema), async (c) =>
            c.json(await context.illustrations.testGenerate(c.req.valid('json'), c.req.raw.signal)),
        )
        .get('/styles', (c) => c.json({ styles: catalog.listStyles() }))
        .post('/styles', jsonValidator(IllustrationStyleInputSchema), (c) =>
            c.json(catalog.createStyle(c.req.valid('json')), 201),
        )
        .put('/styles/:id', jsonValidator(IllustrationStyleInputSchema), (c) =>
            c.json(catalog.updateStyle(c.req.param('id'), c.req.valid('json'))),
        )
        .delete('/styles/:id', (c) => {
            catalog.deleteStyle(c.req.param('id'))
            return c.body(null, 204)
        })
        .post('/styles/:id/test', jsonValidator(IllustrationStyleTestRequestSchema), async (c) =>
            c.json(
                await context.illustrations.testStyle(
                    c.req.param('id'),
                    c.req.valid('json'),
                    c.req.raw.signal,
                ),
            ),
        )
        .get('/actors', queryValidator(IllustrationActorOwnerSchema), (c) =>
            c.json({ actors: catalog.listActors(c.req.valid('query')) }),
        )
        .post('/actors', jsonValidator(IllustrationActorCreateSchema), (c) => {
            const { characterId, personaId, ...input } = c.req.valid('json')
            const owner = characterId ? { characterId } : { personaId: personaId! }
            return c.json(catalog.createActor(owner, input), 201)
        })
        .put('/actors/:id', jsonValidator(IllustrationActorInputSchema), (c) =>
            c.json(catalog.updateActor(c.req.param('id'), c.req.valid('json'))),
        )
        .delete('/actors/:id', (c) => {
            catalog.deleteActor(c.req.param('id'))
            return c.body(null, 204)
        })
        .get('/state-definitions', queryValidator(StateDefinitionScopeSchema), (c) =>
            c.json({
                definitions: catalog.listStateDefinitions(c.req.valid('query').characterId ?? null),
            }),
        )
        .post('/state-definitions', jsonValidator(IllustrationStateDefinitionCreateSchema), (c) => {
            const { characterId, ...input } = c.req.valid('json')
            return c.json(catalog.createStateDefinition(characterId, input), 201)
        })
        .put('/state-definitions/:id', jsonValidator(IllustrationStateDefinitionInputSchema), (c) =>
            c.json(catalog.updateStateDefinition(c.req.param('id'), c.req.valid('json'))),
        )
        .delete('/state-definitions/:id', (c) => {
            catalog.deleteStateDefinition(c.req.param('id'))
            return c.body(null, 204)
        })
        .post('/outfits/:id/promote', (c) =>
            c.json(context.continuity.promoteOutfit(c.req.param('id'))),
        )
        .post('/items/:id/retry', (c) =>
            c.json(context.illustrationPipeline.retry(c.req.param('id')), 202),
        )
}

export function createConversationIllustrationDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/:id/illustrations', (c) => {
            context.illustrationCatalog.conversationSettings(c.req.param('id'))
            return c.json({ illustrations: context.illustrationPipeline.list(c.req.param('id')) })
        })
        .post(
            '/:id/messages/:messageId/illustrations',
            jsonValidator(IllustrateMessageRequestSchema),
            (c) =>
                c.json(
                    context.illustrationPipeline.request(
                        c.req.param('id'),
                        c.req.param('messageId'),
                        c.req.valid('json').count,
                    ),
                    202,
                ),
        )
        .get('/:id/continuity', (c) => c.json(context.continuity.view(c.req.param('id'))))
        .put('/:id/continuity', jsonValidator(ContinuityUpdateSchema), (c) =>
            c.json(context.continuity.saveManual(c.req.param('id'), c.req.valid('json'))),
        )
        .get('/:id/illustration-settings', (c) =>
            c.json(context.illustrationCatalog.conversationSettings(c.req.param('id'))),
        )
        .put(
            '/:id/illustration-settings',
            jsonValidator(ConversationIllustrationSettingsInputSchema),
            (c) =>
                c.json(
                    context.illustrationCatalog.saveConversationSettings(
                        c.req.param('id'),
                        c.req.valid('json'),
                    ),
                ),
        )
}

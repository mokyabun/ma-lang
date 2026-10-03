import {
    CharacterCreateSchema,
    CharacterOrganizationSchema,
    CharacterUpdateSchema,
    GENERAL_CHAT_CHARACTER_ID,
    GroupCreateSchema,
    GroupUpdateSchema,
} from '@malang/shared'
import { Hono } from 'hono'

import { ConflictError, NotFoundError, ValidationError } from '@/errors'
import type { AppContext } from '@/services'
import { type AppEnv, binaryResponse, jsonValidator, parseEnum, readImportFile } from '@/utils'

export function createCharacterDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) =>
            c.json({
                characters: context.characters.list(c.req.query('archived') === 'true'),
                groups: context.store.characterGroup.list(),
            }),
        )
        .post('/', jsonValidator(CharacterCreateSchema), (c) =>
            c.json(context.characters.create(c.req.valid('json')), 201),
        )
        .post('/groups', jsonValidator(GroupCreateSchema), (c) =>
            c.json(context.store.characterGroup.create(c.req.valid('json').name), 201),
        )
        .patch('/groups/:groupId', jsonValidator(GroupUpdateSchema), (c) => {
            const name = c.req.valid('json').name
            if (!name) throw new ValidationError('Group name is required')
            const group = context.store.characterGroup.update(c.req.param('groupId'), name)
            if (!group) throw new NotFoundError('Character group not found')
            return c.json(group)
        })
        .delete('/groups/:groupId', (c) => {
            if (!context.store.characterGroup.delete(c.req.param('groupId'))) {
                throw new NotFoundError('Character group not found')
            }
            return c.body(null, 204)
        })
        .put('/organization', jsonValidator(CharacterOrganizationSchema), (c) => {
            if (!context.store.characterOrganization.update(c.req.valid('json'))) {
                throw new ValidationError('Invalid character organization')
            }
            return c.json({
                characters: context.characters.list(false),
                groups: context.store.characterGroup.list(),
            })
        })
        .post('/import', async (c) => {
            const file = await readImportFile(c, context.config.limits.importBytes)
            return c.json(await context.characters.import(file.bytes, file.filename), 201)
        })
        .post('/import-package', async (c) => {
            const file = await readImportFile(c, context.config.limits.importBytes)
            return c.json(await context.characters.importPackage(file.bytes), 201)
        })
        .post('/:id/restore', (c) => {
            if (!context.characters.restore(c.req.param('id'))) {
                throw new NotFoundError('Character not found')
            }
            return c.json(context.characters.get(c.req.param('id')))
        })
        .get('/:id/assets', (c) => {
            const assets = context.characters.assets(c.req.param('id'))
            if (!assets) throw new NotFoundError('Character not found')
            return c.json({ assets })
        })
        .put('/:id/avatar', async (c) => {
            rejectBuiltInChatMutation(c.req.param('id'))
            const file = await readImportFile(c, context.config.limits.assetBytes)
            const character = await context.characters.setAvatar(
                c.req.param('id'),
                file.bytes,
                file.mimeType,
            )
            if (!character) throw new NotFoundError('Character not found')
            return c.json(character)
        })
        .delete('/:id/avatar', (c) => {
            rejectBuiltInChatMutation(c.req.param('id'))
            const character = context.characters.removeAvatar(c.req.param('id'))
            if (!character) throw new NotFoundError('Character not found')
            return c.json(character)
        })
        .get('/:id/export', async (c) => {
            const spec = parseEnum(c.req.query('spec') ?? 'v3', ['v2', 'v3'] as const, 'spec')
            const format = parseEnum(
                c.req.query('format') ?? 'json',
                ['json', 'png', 'charx'] as const,
                'format',
            )

            if (spec === 'v2' && format === 'charx') {
                throw new ValidationError('CHARX requires spec=v3')
            }

            const value = await context.characters.export(c.req.param('id'), spec, format)
            if (!value) throw new NotFoundError('Character not found')

            return binaryResponse(
                value.bytes,
                value.mimeType,
                `character-${c.req.param('id')}.${value.extension}`,
                value.warnings,
            )
        })
        .get('/:id/export-package', async (c) => {
            const value = await context.characters.exportPackage(c.req.param('id'))
            if (!value) throw new NotFoundError('Character not found')
            return binaryResponse(
                value.bytes,
                value.mimeType,
                `character-${c.req.param('id')}-package.${value.extension}`,
                value.warnings,
            )
        })
        .get('/:id', (c) => {
            const character = context.characters.get(c.req.param('id'))
            if (!character) throw new NotFoundError('Character not found')
            return c.json(character)
        })
        .patch('/:id', jsonValidator(CharacterUpdateSchema), (c) => {
            rejectBuiltInChatMutation(c.req.param('id'))
            const character = context.characters.update(c.req.param('id'), c.req.valid('json'))
            if (!character) throw new NotFoundError('Character not found')
            return c.json(character)
        })
        .delete('/:id/permanent', (c) => {
            const characterId = c.req.param('id')
            rejectBuiltInChatMutation(characterId)
            if (!context.characters.get(characterId)) {
                throw new NotFoundError('Character not found')
            }
            const generating = context.store.conversation
                .list(true)
                .some(
                    (conversation) =>
                        conversation.characterId === characterId &&
                        context.store.generation.findRunning(conversation.id),
                )
            if (generating) {
                throw new ConflictError('Character cannot be deleted while a generation is running')
            }
            if (!context.characters.delete(characterId)) {
                throw new NotFoundError('Character not found')
            }
            return c.body(null, 204)
        })
        .delete('/:id', (c) => {
            rejectBuiltInChatMutation(c.req.param('id'))
            if (!context.characters.archive(c.req.param('id'))) {
                throw new NotFoundError('Character not found')
            }
            return c.body(null, 204)
        })
}

function rejectBuiltInChatMutation(characterId: string) {
    if (characterId === GENERAL_CHAT_CHARACTER_ID) {
        throw new ConflictError('The built-in Chat character cannot be changed')
    }
}

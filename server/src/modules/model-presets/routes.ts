import {
    ModelApiKeyInputSchema,
    ModelDiscoveryInputSchema,
    ModelPresetInputSchema,
} from '@malang/shared'
import { Hono } from 'hono'

import type { AppContext } from '@/context'
import {
    exportPocketRisuModelProfile,
    importPocketRisuModelProfile,
} from '@/integrations/providers'
import { ConflictError, NotFoundError } from '@/lib/errors'
import { type AppEnv, binaryResponse, jsonValidator, readImportFile } from '@/lib/http'

export function createModelPresetRoutes(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) =>
            c.json({
                presets: context.providers.listModelPresets(),
                apiKeys: context.providers.listApiKeys(),
            }),
        )
        .post('/', jsonValidator(ModelPresetInputSchema), (c) =>
            c.json(context.providers.createModelPreset(c.req.valid('json')), 201),
        )
        .post('/import', async (c) => {
            const file = await readImportFile(c, context.config.limits.importBytes)
            return c.json(
                context.providers.createModelPreset(importPocketRisuModelProfile(file.bytes)),
                201,
            )
        })
        .post('/models', jsonValidator(ModelDiscoveryInputSchema), async (c) =>
            c.json({ models: await context.providers.listModelsForInput(c.req.valid('json')) }),
        )
        .get('/:id/export', (c) => {
            const preset = context.providers.getModelPreset(c.req.param('id'))
            if (!preset) throw new NotFoundError('Model preset not found')
            return binaryResponse(
                exportPocketRisuModelProfile(preset),
                'application/json',
                `${safeFilename(preset.name)}.profile.json`,
            )
        })
        .put('/:id', jsonValidator(ModelPresetInputSchema), (c) => {
            const preset = context.providers.updateModelPreset(
                c.req.param('id'),
                c.req.valid('json'),
            )
            if (!preset) throw new NotFoundError('Model preset not found')
            return c.json(preset)
        })
        .delete('/:id', (c) => {
            const result = context.providers.deleteModelPreset(c.req.param('id'))
            if (result === 'not_found') {
                throw new NotFoundError('Model preset not found')
            }
            if (result === 'in_use') {
                throw new ConflictError(
                    '기본값 또는 채팅에 바인딩된 모델 프리셋은 삭제할 수 없습니다.',
                )
            }
            return c.body(null, 204)
        })
        .post('/:id/test', async (c) =>
            c.json(await context.providers.testModelPreset(c.req.param('id'))),
        )
        .get('/:id/models', async (c) =>
            c.json({ models: await context.providers.listModelsForPreset(c.req.param('id')) }),
        )
        .post('/api-keys', jsonValidator(ModelApiKeyInputSchema), async (c) =>
            c.json(await context.providers.createApiKey(c.req.valid('json')), 201),
        )
        .put('/api-keys/:id', jsonValidator(ModelApiKeyInputSchema), async (c) => {
            const key = await context.providers.updateApiKey(c.req.param('id'), c.req.valid('json'))
            if (!key) throw new NotFoundError('API key not found')
            return c.json(key)
        })
        .delete('/api-keys/:id', async (c) => {
            const result = await context.providers.deleteApiKey(c.req.param('id'))
            if (result === 'not_found') throw new NotFoundError('API key not found')
            if (result === 'in_use') {
                throw new ConflictError('모델 프리셋에서 사용 중인 API 키는 삭제할 수 없습니다.')
            }
            return c.body(null, 204)
        })
}

function safeFilename(value: string) {
    return (
        value
            .trim()
            .replace(/[^\p{L}\p{N}._-]+/gu, '_')
            .slice(0, 120) || 'model'
    )
}

import { randomUUID } from 'node:crypto'

import { Hono } from 'hono'

import type { AppContext } from '@/context'
import { errorResponse, normalizeError, NotFoundError } from '@/lib/errors'
import type { AppEnv } from '@/lib/http'
import { createAssetRoutes } from '@/modules/assets/routes'
import { sessionMiddleware } from '@/modules/auth/middleware'
import { createAuthRoutes } from '@/modules/auth/routes'
import { createCharacterRoutes } from '@/modules/characters/routes'
import { createConversationRoutes } from '@/modules/conversations/routes'
import { createDebugRoutes } from '@/modules/debug/routes'
import {
    createConversationGenerationRoutes,
    createGenerationRoutes,
} from '@/modules/generations/routes'
import {
    createConversationIllustrationRoutes,
    createIllustrationRoutes,
} from '@/modules/illustrations/routes'
import { createJobRoutes } from '@/modules/jobs/routes'
import { createConversationLuaRoutes, createLuaRuntimeRoutes } from '@/modules/lua/routes'
import { createModelChainRoutes } from '@/modules/model-chains/routes'
import { createModelPresetRoutes } from '@/modules/model-presets/routes'
import { createPersonaRoutes } from '@/modules/personas/routes'
import { createPromptModuleRoutes } from '@/modules/prompt-modules/routes'
import { createPromptPresetRoutes } from '@/modules/prompts/routes'
import { createProviderRoutes } from '@/modules/providers/routes'
import { createRealtimeRoutes } from '@/modules/realtime/routes'
import { originMiddleware } from '@/modules/security/middleware'
import { createSettingsRoutes } from '@/modules/settings/routes'
import { createUploadRoutes } from '@/modules/uploads/routes'

function routeApi(app: Hono<AppEnv>, context: AppContext) {
    return app
        .route('/api/v1/auth', createAuthRoutes(context))
        .route('/api/v1/settings', createSettingsRoutes(context))
        .route('/api/v1/debug', createDebugRoutes(context))
        .route('/api/v1/provider', createProviderRoutes(context))
        .route('/api/v1/model-presets', createModelPresetRoutes(context))
        .route('/api/v1/model-chains', createModelChainRoutes(context))
        .route('/api/v1/characters', createCharacterRoutes(context))
        .route('/api/v1/personas', createPersonaRoutes(context))
        .route('/api/v1/assets', createAssetRoutes(context))
        .route('/api/v1/uploads', createUploadRoutes(context))
        .route('/api/v1/prompt-presets', createPromptPresetRoutes(context))
        .route('/api/v1/prompt-modules', createPromptModuleRoutes(context))
        .route('/api/v1/conversations', createConversationRoutes(context))
        .route('/api/v1/conversations', createConversationGenerationRoutes(context))
        .route('/api/v1/conversations', createConversationLuaRoutes(context))
        .route('/api/v1/conversations', createConversationIllustrationRoutes(context))
        .route('/api/v1/generations', createGenerationRoutes(context))
        .route('/api/v1/runtime', createRealtimeRoutes(context))
        .route('/api/v1/runtime', createLuaRuntimeRoutes(context))
        .route('/api/v1/jobs', createJobRoutes(context))
        .route('/api/v1/illustrations', createIllustrationRoutes(context))
}

export function createApp(context: AppContext) {
    const app = new Hono<AppEnv>()
    const log = context.logger.child({ module: 'server' })

    app.use('*', async (c, next) => {
        const startedAt = performance.now()
        const requestId = c.req.header('x-request-id')?.slice(0, 128) ?? randomUUID()
        c.set('requestId', requestId)
        c.header('x-request-id', requestId)

        await next()

        log.debug(
            {
                event: 'request.completed',
                requestId,
                method: c.req.method,
                path: new URL(c.req.url).pathname,
                status: c.res.status,
                durationMs: Math.round(performance.now() - startedAt),
            },
            'Request completed',
        )
    })
    app.use('*', originMiddleware(context.config.allowedOrigins))
    app.use('/api/v1/*', sessionMiddleware(context))
    app.onError((error, c) => {
        const requestId = c.get('requestId') ?? randomUUID()
        const normalized = normalizeError(error, requestId)
        if (normalized.unexpected) {
            log.error(
                {
                    event: 'request.unhandled_error',
                    requestId,
                    method: c.req.method,
                    path: new URL(c.req.url).pathname,
                    err: normalized.cause,
                },
                'Unhandled error',
            )
        }
        return errorResponse(normalized)
    })
    app.notFound((c) => {
        const requestId = c.get('requestId') ?? randomUUID()
        return errorResponse(normalizeError(new NotFoundError('Route not found'), requestId))
    })
    app.get('/health/live', (c) => c.json({ status: 'ok' }))
    app.get('/health/ready', (c) => {
        try {
            context.database.sqlite.query('SELECT 1').get()
            return c.json({ status: 'ready' })
        } catch {
            return c.json({ status: 'not_ready' }, 503)
        }
    })
    return routeApi(app, context)
}

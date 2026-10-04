import { randomUUID } from 'node:crypto'

import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'

import {
    createAssetDomain,
    createAuthDomain,
    createCharacterDomain,
    createConversationDomain,
    createConversationGenerationDomain,
    createConversationLuaDomain,
    createDebugDomain,
    createGenerationDomain,
    createModelPresetDomain,
    createModelChainDomain,
    createPersonaDomain,
    createPromptPresetDomain,
    createPromptModuleDomain,
    createRuntimeDomain,
    createProviderDomain,
    createSettingsDomain,
    createUploadDomain,
    SESSION_COOKIE,
} from '@/domains'
import {
    errorResponse,
    ForbiddenError,
    normalizeError,
    NotFoundError,
    UnauthorizedError,
} from '@/errors'
import type { AppContext } from '@/services'

import type { AppEnv } from './utils'

function routeApi(app: Hono<AppEnv>, context: AppContext) {
    return app
        .route('/api/v1/auth', createAuthDomain(context))
        .route('/api/v1/settings', createSettingsDomain(context))
        .route('/api/v1/debug', createDebugDomain(context))
        .route('/api/v1/provider', createProviderDomain(context))
        .route('/api/v1/model-presets', createModelPresetDomain(context))
        .route('/api/v1/model-chains', createModelChainDomain(context))
        .route('/api/v1/characters', createCharacterDomain(context))
        .route('/api/v1/personas', createPersonaDomain(context))
        .route('/api/v1/assets', createAssetDomain(context))
        .route('/api/v1/uploads', createUploadDomain(context))
        .route('/api/v1/prompt-presets', createPromptPresetDomain(context))
        .route('/api/v1/prompt-modules', createPromptModuleDomain(context))
        .route('/api/v1/conversations', createConversationDomain(context))
        .route('/api/v1/conversations', createConversationGenerationDomain(context))
        .route('/api/v1/conversations', createConversationLuaDomain(context))
        .route('/api/v1/generations', createGenerationDomain(context))
        .route('/api/v1/runtime', createRuntimeDomain(context))
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
    app.use('*', async (c, next) => {
        const origin = c.req.header('origin')

        if (origin && context.config.allowedOrigins.has(origin)) {
            c.header('access-control-allow-origin', origin)
            c.header('access-control-allow-credentials', 'true')
            c.header('vary', 'Origin')
        }
        if (c.req.method === 'OPTIONS') {
            if (origin && !context.config.allowedOrigins.has(origin)) {
                throw new ForbiddenError('Origin is not allowed')
            }
            c.header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
            c.header(
                'access-control-allow-headers',
                'content-type,x-request-id,x-filename,x-upload-id',
            )
            return c.body(null, 204)
        }
        if (
            !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
            origin &&
            !context.config.allowedOrigins.has(origin)
        ) {
            throw new ForbiddenError('Origin is not allowed')
        }

        await next()
    })
    app.use('/api/v1/*', async (c, next) => {
        const path = new URL(c.req.url).pathname
        if (path === '/api/v1/auth/login') {
            return next()
        }

        const token = getCookie(c, SESSION_COOKIE)
        const session = token ? await context.auth.authenticate(token) : null
        if (!session) throw new UnauthorizedError('Authentication is required')

        c.set('adminId', session.adminId)
        await next()
    })
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
            context.store.sqlite.query('SELECT 1').get()
            return c.json({ status: 'ready' })
        } catch {
            return c.json({ status: 'not_ready' }, 503)
        }
    })
    return routeApi(app, context)
}

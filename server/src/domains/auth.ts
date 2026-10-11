import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'

import type { AppContext } from '@/context'
import { RateLimitError, UnauthorizedError } from '@/lib/errors'
import { type AppEnv, jsonValidator } from '@/lib/http'

const SESSION_COOKIE = 'malang_session'
const LoginBody = z.object({ password: z.string().min(1).max(10_000) })
const PasswordPatchBody = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12).max(10_000),
})

export function createAuthDomain(context: AppContext) {
    const attempts = new Map<string, { count: number; resetAt: number }>()

    return new Hono<AppEnv>()
        .post('/login', jsonValidator(LoginBody), async (c) => {
            const key = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
            const now = Date.now()
            const attempt = attempts.get(key)

            if (attempt && attempt.resetAt > now && attempt.count >= 10) {
                throw new RateLimitError('Too many login attempts')
            }

            const session = await context.auth.login(c.req.valid('json').password)
            if (!session) {
                attempts.set(
                    key,
                    attempt && attempt.resetAt > now
                        ? { count: attempt.count + 1, resetAt: attempt.resetAt }
                        : { count: 1, resetAt: now + 15 * 60_000 },
                )
                throw new UnauthorizedError('Invalid password')
            }

            attempts.delete(key)
            setCookie(c, SESSION_COOKIE, session.token, {
                httpOnly: true,
                sameSite: 'Strict',
                secure: context.config.cookieSecure,
                path: '/',
                expires: new Date(session.expiresAt),
            })

            return c.json({
                authenticated: true,
                expiresAt: new Date(session.expiresAt).toISOString(),
            })
        })
        .post('/logout', async (c) => {
            const token = getCookie(c, SESSION_COOKIE)
            if (token) await context.auth.logout(token)

            deleteCookie(c, SESSION_COOKIE, {
                path: '/',
                secure: context.config.cookieSecure,
            })
            return c.body(null, 204)
        })
        .get('/session', (c) => c.json({ authenticated: true }))
        .patch('/password', jsonValidator(PasswordPatchBody), async (c) => {
            const body = c.req.valid('json')
            const changed = await context.auth.changePassword(
                c.get('adminId'),
                body.currentPassword,
                body.newPassword,
            )

            if (!changed) {
                throw new UnauthorizedError('Current password is incorrect')
            }

            deleteCookie(c, SESSION_COOKIE, {
                path: '/',
                secure: context.config.cookieSecure,
            })
            return c.body(null, 204)
        })
}

export { SESSION_COOKIE }

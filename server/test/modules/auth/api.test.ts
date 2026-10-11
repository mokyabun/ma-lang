import { afterAll, describe, expect, test } from 'bun:test'

import { createTestApp } from '../../helpers/app'

const t = await createTestApp({
    login: false,
    config: { allowedOrigins: new Set(['https://chat.example']) },
})
afterAll(() => t.close())

describe('administrator authentication', () => {
    test('protects API routes and creates an administrator session', async () => {
        expect((await t.send('/settings')).status).toBe(401)
        const response = await t.send('/auth/login', {
            method: 'POST',
            headers: { origin: 'https://chat.example' },
            body: { password: t.config.adminPassword },
        })
        expect(response.status).toBe(200)
        const cookie = response.headers.get('set-cookie')!.split(';')[0]!
        expect(cookie).toStartWith('malang_session=')
    })

    test('encrypts a Vertex API key and re-encrypts it after a password change', async () => {
        // Changes the admin password and reopens the database, so it needs its own app.
        const isolated = await createTestApp({ login: false })
        try {
            await isolated.login()

            const apiKey = 'test-vertex-api-key-that-must-never-be-plaintext'
            const configured = await isolated.send('/provider', {
                method: 'PUT',
                body: {
                    provider: 'vertex',
                    projectId: '',
                    location: 'global',
                    modelId: 'gemini-test',
                    defaults: {},
                    apiKey,
                },
            })
            expect(configured.status).toBe(200)
            const providerBody = (await configured.json()) as Record<string, unknown>
            expect(providerBody).toMatchObject({ apiKeyConfigured: true, apiKeyLocked: false })
            expect(providerBody).not.toHaveProperty('apiKey')

            const stored = isolated.context.database.sqlite
                .query<
                    { provider_json: string; provider_secret_json: string; secret_salt: string },
                    []
                >(
                    'SELECT provider_json, provider_secret_json, secret_salt FROM app_settings WHERE id = 1',
                )
                .get()!
            expect(stored.provider_json).not.toContain(apiKey)
            expect(stored.provider_secret_json).not.toContain(apiKey)
            expect(stored.provider_secret_json).toContain('AES-256-GCM')
            expect(stored.secret_salt.length).toBeGreaterThan(10)

            const newPassword = 'new correct horse battery staple'
            const changed = await isolated.send('/auth/password', {
                method: 'PATCH',
                body: { currentPassword: isolated.config.adminPassword, newPassword },
            })
            expect(changed.status).toBe(204)

            await isolated.reopen({ adminPassword: undefined })
            expect(isolated.context.providers.get()).toMatchObject({
                apiKeyConfigured: true,
                apiKeyLocked: true,
            })

            await isolated.login(newPassword)
            const runtime = await isolated.context.providers.requireRuntime()
            expect(runtime).toMatchObject({ provider: 'vertex', apiKey })
            expect(isolated.context.providers.get()).toMatchObject({
                apiKeyConfigured: true,
                apiKeyLocked: false,
            })

            const serviceAccount = {
                type: 'service_account',
                project_id: 'vertex-service-account-project',
                private_key_id: 'private-key-id',
                private_key:
                    '-----BEGIN PRIVATE KEY-----\nnot-a-real-private-key\n-----END PRIVATE KEY-----\n',
                client_email: 'malang-test@vertex-service-account-project.iam.gserviceaccount.com',
                client_id: '123456789',
                token_uri: 'https://oauth2.googleapis.com/token',
            }
            const serviceAccountConfigured = await isolated.send('/provider', {
                method: 'PUT',
                body: {
                    provider: 'vertex',
                    projectId: '',
                    location: 'us-central1',
                    modelId: 'gemini-test',
                    defaults: {},
                    serviceAccountJson: JSON.stringify(serviceAccount),
                },
            })
            expect(serviceAccountConfigured.status).toBe(200)
            expect((await serviceAccountConfigured.json()) as object).toMatchObject({
                credentialType: 'serviceAccount',
                projectId: serviceAccount.project_id,
                apiKeyConfigured: false,
                serviceAccountConfigured: true,
            })
            const serviceAccountStorage = isolated.context.database.sqlite
                .query<{ provider_json: string; provider_secret_json: string }, []>(
                    'SELECT provider_json, provider_secret_json FROM app_settings WHERE id = 1',
                )
                .get()!
            expect(serviceAccountStorage.provider_json).not.toContain(serviceAccount.private_key)
            expect(serviceAccountStorage.provider_secret_json).not.toContain(
                serviceAccount.private_key,
            )
            expect(serviceAccountStorage.provider_secret_json).not.toContain(
                serviceAccount.client_email,
            )
            expect(await isolated.context.providers.requireRuntime()).toMatchObject({
                provider: 'vertex',
                projectId: serviceAccount.project_id,
                serviceAccount,
            })
        } finally {
            await isolated.close()
        }
    })
})

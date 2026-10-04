import { describe, expect, it } from 'bun:test'

import { EnvConfigSchema } from '../src/config'

function parseConfig(env: Record<string, string | undefined>) {
    return EnvConfigSchema.parse(env)
}

describe('runtime config', () => {
    it('enables automatic backups by default and accepts explicit opt-outs', () => {
        expect(parseConfig({ NODE_ENV: 'test' }).autoBackupEnabled).toBe(true)
        for (const value of ['false', '0', 'off', 'no']) {
            expect(
                parseConfig({ NODE_ENV: 'test', AUTO_BACKUP_ENABLED: value }).autoBackupEnabled,
            ).toBe(false)
        }
        expect(
            EnvConfigSchema.safeParse({ NODE_ENV: 'test', AUTO_BACKUP_ENABLED: 'invalid' }).success,
        ).toBe(false)
    })
    it('uses environment-specific logging defaults', () => {
        expect(parseConfig({ NODE_ENV: 'development', SESSION_SECRET: 'secret' })).toMatchObject({
            logLevel: 'info',
            logPretty: true,
            logColorize: true,
        })
        expect(parseConfig({ NODE_ENV: 'production', SESSION_SECRET: 'secret' })).toMatchObject({
            logLevel: 'info',
            logPretty: false,
            logColorize: false,
        })
        expect(parseConfig({ NODE_ENV: 'test' })).toMatchObject({
            logLevel: 'silent',
            logPretty: false,
            logColorize: false,
        })
    })

    it('configures logging options independently through the environment', () => {
        expect(
            parseConfig({
                NODE_ENV: 'development',
                SESSION_SECRET: 'secret',
                LOG_LEVEL: 'debug',
            }),
        ).toMatchObject({
            logLevel: 'debug',
            logPretty: true,
            logColorize: true,
        })

        expect(
            parseConfig({
                NODE_ENV: 'development',
                SESSION_SECRET: 'secret',
                LOG_PRETTY: 'false',
                LOG_COLORIZE: 'false',
            }),
        ).toMatchObject({
            logPretty: false,
            logColorize: false,
        })

        expect(
            parseConfig({
                NODE_ENV: 'production',
                SESSION_SECRET: 'secret',
                LOG_PRETTY: 'true',
                LOG_COLORIZE: 'true',
            }),
        ).toMatchObject({
            logPretty: true,
            logColorize: true,
        })
    })

    it('parses scalar and list values', () => {
        const config = parseConfig({
            NODE_ENV: 'test',
            HOST: '127.0.0.1',
            PORT: '5000',
            ALLOWED_ORIGINS: 'https://one.example, https://two.example',
        })

        expect(config.host).toBe('127.0.0.1')
        expect(config.port).toBe(5000)
        expect(config.allowedOrigins).toEqual(
            new Set(['https://one.example', 'https://two.example']),
        )
    })

    it('accepts imports up to 1 GiB by default', () => {
        expect(parseConfig({ NODE_ENV: 'test' }).limits).toMatchObject({
            importBytes: 1024 * 1024 * 1024,
            assetBytes: 1024 * 1024 * 1024,
        })
    })

    it('allows a single asset up to the total import limit by default', () => {
        const defaults = parseConfig({ NODE_ENV: 'test', MAX_IMPORT_BYTES: '67108864' })
        expect(defaults.limits).toMatchObject({
            importBytes: 67_108_864,
            assetBytes: 67_108_864,
        })

        const constrained = parseConfig({
            NODE_ENV: 'test',
            MAX_IMPORT_BYTES: '67108864',
            MAX_ASSET_BYTES: '8388608',
        })
        expect(constrained.limits.assetBytes).toBe(8_388_608)
    })

    it('requires a session secret outside tests', () => {
        expect(() => parseConfig({ NODE_ENV: 'production' })).toThrow('SESSION_SECRET is required')
    })
})

import { resolve } from 'node:path'

import { z } from 'zod'

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
const NodeEnvSchema = z.enum(['development', 'test', 'production'])
const EnvBooleanSchema = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(['1', 'true', 'yes', 'on', '0', 'false', 'no', 'off']))
    .transform((value) => ['1', 'true', 'yes', 'on'].includes(value))
const EnvPositiveIntegerSchema = z.coerce.number().int().positive()
const EnvListSchema = z.string().transform((value) =>
    value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
)

export const EnvConfigSchema = z
    .object({
        NODE_ENV: NodeEnvSchema.default('development'),
        HOST: z.string().min(1).default('0.0.0.0'),
        PORT: EnvPositiveIntegerSchema.default(3000),
        DATA_DIR: z.string().min(1).optional(),
        DATABASE_URL: z.string().min(1).optional(),
        AUTO_BACKUP_ENABLED: EnvBooleanSchema.default(true),
        ADMIN_PASSWORD: z.string().optional(),
        SESSION_SECRET: z.string().optional(),
        ALLOWED_ORIGINS: EnvListSchema.default([]),
        COOKIE_SECURE: EnvBooleanSchema.optional(),
        LOG_LEVEL: LogLevelSchema.optional(),
        LOG_PRETTY: EnvBooleanSchema.optional(),
        LOG_COLORIZE: EnvBooleanSchema.optional(),
        MAX_IMPORT_BYTES: EnvPositiveIntegerSchema.default(1024 * 1024 * 1024),
        MAX_CARD_JSON_BYTES: EnvPositiveIntegerSchema.default(8 * 1024 * 1024),
        MAX_ASSET_BYTES: EnvPositiveIntegerSchema.optional(),
        // RisuAI writes each asset plus its x_meta/*.json.
        MAX_ARCHIVE_ENTRIES: EnvPositiveIntegerSchema.default(65536),
        // Chunked so uploads pass proxy body limits (nginx default: 1 MiB).
        UPLOAD_CHUNK_BYTES: EnvPositiveIntegerSchema.default(512 * 1024),
    })
    .transform((raw) => {
        const isProduction = raw.NODE_ENV === 'production'
        const isTest = raw.NODE_ENV === 'test'
        const isDevelopment = !isProduction && !isTest
        const dataDir = resolve(raw.DATA_DIR ?? (isTest ? './.test-data' : './data'))
        const sessionSecret = raw.SESSION_SECRET ?? (isTest ? 'test-session-secret' : '')

        if (!sessionSecret) throw new Error('SESSION_SECRET is required')

        return {
            nodeEnv: raw.NODE_ENV,
            host: raw.HOST,
            port: raw.PORT,
            dataDir,
            databasePath: resolve(raw.DATABASE_URL ?? `${dataDir}/data.sqlite`),
            autoBackupEnabled: raw.AUTO_BACKUP_ENABLED,
            adminPassword: raw.ADMIN_PASSWORD,
            sessionSecret,
            allowedOrigins: new Set(raw.ALLOWED_ORIGINS),
            cookieSecure: raw.COOKIE_SECURE ?? isProduction,
            logLevel: raw.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
            logPretty: raw.LOG_PRETTY ?? isDevelopment,
            logColorize: raw.LOG_COLORIZE ?? isDevelopment,
            limits: {
                importBytes: raw.MAX_IMPORT_BYTES,
                jsonBytes: raw.MAX_CARD_JSON_BYTES,
                assetBytes: raw.MAX_ASSET_BYTES ?? raw.MAX_IMPORT_BYTES,
                archiveEntries: raw.MAX_ARCHIVE_ENTRIES,
                uploadChunkBytes: raw.UPLOAD_CHUNK_BYTES,
            },
        }
    })

export type AppConfig = z.output<typeof EnvConfigSchema>

function formatZodError(error: z.ZodError) {
    return error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')
}

export function loadConfig(env: Record<string, string | undefined> = Bun.env): AppConfig {
    const parsed = EnvConfigSchema.safeParse(env)
    if (!parsed.success) {
        throw new Error(`Invalid environment config: ${formatZodError(parsed.error)}`)
    }
    return parsed.data
}

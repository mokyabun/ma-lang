import pino, { type Logger } from 'pino'

import type { AppConfig } from './config'
import type { SystemLogService } from './modules/system/logs'

const REDACT_PATHS = [
    'password',
    '*.password',
    'token',
    '*.token',
    'authorization',
    '*.authorization',
    'headers.cookie',
    'req.headers.cookie',
    'request.headers.cookie',
    'prompt',
    '*.prompt',
    'content',
    '*.content',
]

export function createLogger(
    config: Pick<AppConfig, 'nodeEnv' | 'logLevel' | 'logPretty' | 'logColorize'>,
    systemLogs?: SystemLogService,
): Logger {
    const options: pino.LoggerOptions = {
        level: config.logLevel,
        base: { service: 'malang-server', env: config.nodeEnv },
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
            level(label) {
                return { level: label }
            },
        },
        redact: {
            paths: REDACT_PATHS,
            censor: '[redacted]',
        },
        serializers: {
            err: pino.stdSerializers.err,
            error: pino.stdSerializers.err,
        },
        ...(systemLogs
            ? {
                  hooks: {
                      logMethod(args, method, level) {
                          systemLogs.capture(level, args, this.bindings())
                          method.apply(this, args)
                      },
                  },
              }
            : {}),
    }

    if (!config.logPretty) return pino(options)

    return pino({
        ...options,
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: config.logColorize,
                ignore: 'service,env',
                messageFormat: '[{module}] {msg}',
                singleLine: true,
                translateTime: 'SYS:standard',
            },
        },
    })
}

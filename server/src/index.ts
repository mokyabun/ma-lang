import { createApp } from './app'
import { createContext } from './services'

const context = await createContext()
const app = createApp(context)
const log = context.logger.child({ module: 'server' })

log.info(
    {
        event: 'server.started',
        hostname: context.config.host,
        port: context.config.port,
        environment: context.config.nodeEnv,
        logLevel: context.config.logLevel,
        // .env is read once at process start (`bun --hot` keeps it), so log the effective limits.
        importBytes: context.config.limits.importBytes,
        uploadChunkBytes: context.config.limits.uploadChunkBytes,
    },
    'Server started',
)

const shutdown = () => {
    context.close()
    process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

// Bun rejects larger bodies with 413 before routing (default 128 MiB), so the cap must cover
// the largest import plus multipart framing overhead.
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024

export default {
    hostname: context.config.host,
    port: context.config.port,
    maxRequestBodySize:
        Math.max(context.config.limits.importBytes, context.config.limits.assetBytes) +
        MULTIPART_OVERHEAD_BYTES,
    fetch: app.fetch,
}

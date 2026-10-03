// Runs request.oracle.ts with PocketRisu's installed Vite, Svelte plugin and
// dependency versions. Unlike the display oracle, nothing is stubbed: sendChat
// reads the real stores, database defaults, preset and module plumbing.
// Invoked through request.ts; it never runs as part of Malang's own test suites.
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const oracleDir = dirname(fileURLToPath(import.meta.url))
const pocketRisuRoot = resolve(
    process.env.POCKETRISU_ROOT ?? resolve(oracleDir, '../../extra/PocketRisu'),
)
const { svelte } = await import(
    pathToFileURL(resolve(pocketRisuRoot, 'node_modules/@sveltejs/vite-plugin-svelte/src/index.js'))
        .href
)

export default {
    root: pocketRisuRoot,
    plugins: [svelte()],
    resolve: {
        alias: { src: resolve(pocketRisuRoot, 'src') },
        conditions: ['browser'],
    },
    server: { fs: { allow: [pocketRisuRoot, oracleDir] } },
    test: {
        dir: oracleDir,
        include: ['request.oracle.ts'],
        environment: 'happy-dom',
        setupFiles: [resolve(oracleDir, 'request-setup.ts')],
        testTimeout: 600_000,
    },
}

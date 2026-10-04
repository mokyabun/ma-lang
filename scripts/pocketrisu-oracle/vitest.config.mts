// Runs runner.oracle.ts with PocketRisu's installed Vite, Svelte plugin and
// dependency versions, so the oracle executes exactly the code PocketRisu ships.
// Invoked through index.ts; it never runs as part of Malang's own test suites.
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const oracleDir = dirname(fileURLToPath(import.meta.url))
const pocketRisuRoot = resolve(
    process.env.POCKETRISU_ROOT ?? resolve(oracleDir, '../../extra/PocketRisu'),
)
const { svelte } = await import(
    pathToFileURL(resolve(pocketRisuRoot, 'node_modules/@sveltejs/vite-plugin-svelte/src/index.js'))
        .href
)

// PocketRisu modules replaced by stubs, keyed by their resolved source path.
const stubs = new Map([
    [resolve(pocketRisuRoot, 'src/ts/stores.svelte.ts'), resolve(oracleDir, 'stubs/stores.ts')],
    [
        resolve(pocketRisuRoot, 'src/ts/globalApi.svelte.ts'),
        resolve(oracleDir, 'stubs/global-api.ts'),
    ],
])

const isBareImport = (source: string) =>
    !/^(?:\.{1,2}\/|\/|\0|[a-z]:[\\/]|node:|virtual:)/i.test(source)

const oracleStubs = {
    name: 'malang-pocketrisu-oracle',
    enforce: 'pre' as const,
    async resolveId(this: any, source: string, importer: string | undefined, options: object) {
        // Packages imported by oracle files resolve from PocketRisu's node_modules,
        // which keeps a single svelte/store and vitest instance in the graph.
        if (importer?.startsWith(oracleDir + sep) && isBareImport(source)) {
            return this.resolve(source, resolve(pocketRisuRoot, 'package.json'), {
                ...options,
                skipSelf: true,
            })
        }
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
        const stub = resolved && stubs.get(resolved.id.split('?')[0])
        return stub ? { id: stub } : resolved
    },
}

export default {
    root: pocketRisuRoot,
    plugins: [oracleStubs, svelte()],
    resolve: {
        alias: { src: resolve(pocketRisuRoot, 'src') },
        conditions: ['browser'],
    },
    server: { fs: { allow: [pocketRisuRoot, oracleDir] } },
    test: {
        dir: oracleDir,
        include: ['runner.oracle.ts'],
        environment: resolve(oracleDir, 'happy-dom-environment.mjs'),
        setupFiles: [resolve(oracleDir, 'setup.ts')],
        testTimeout: 600_000,
    },
}

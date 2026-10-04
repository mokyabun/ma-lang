// Vitest's built-in happy-dom environment, but with the happy-dom version Malang's
// tests use. PocketRisu pins an older happy-dom whose HTML parser mis-nests unclosed
// tags and skips named character references; rendering both sides with the same DOM
// keeps parity failures about the renderers rather than about two test DOMs.
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const oracleDir = dirname(fileURLToPath(import.meta.url))
const pocketRisuRoot = resolve(
    process.env.POCKETRISU_ROOT ?? resolve(oracleDir, '../../extra/PocketRisu'),
)
const happyDomEntry = resolve(oracleDir, '../../web/node_modules/happy-dom/lib/index.js')
const vitestRuntime = resolve(pocketRisuRoot, 'node_modules/vitest/dist/runtime.js')

export default {
    name: 'malang-happy-dom',
    viteEnvironment: 'client',
    async setup(global) {
        const { Window } = await import(pathToFileURL(happyDomEntry).href)
        const { populateGlobal } = await import(pathToFileURL(vitestRuntime).href)
        const win = new Window({
            console: global.console,
            url: 'http://localhost:3000',
            settings: { disableErrorCapturing: true },
        })
        const { keys, originals } = populateGlobal(global, win, {
            bindFunctions: true,
            additionalKeys: [
                'Request',
                'Response',
                'MessagePort',
                'fetch',
                'Headers',
                'AbortController',
                'AbortSignal',
                'URL',
                'URLSearchParams',
                'FormData',
            ],
        })
        return {
            async teardown(target) {
                await win.happyDOM.abort()
                win.close()
                keys.forEach((key) => delete target[key])
                originals.forEach((value, key) => (target[key] = value))
            },
        }
    },
}

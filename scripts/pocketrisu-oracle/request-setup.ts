// Setup for request.oracle.ts. PocketRisu installs safeStructuredClone during
// app bootstrap, and its tokenizers fetch their vocabularies from the app's own
// origin; serve those from PocketRisu's public/ directory and refuse any other
// network access so a scenario can never reach a real provider.
//
// stores.svelte is loaded here, ahead of every other PocketRisu module: it
// registers effects that read database.svelte, and loading it from inside that
// module's import cycle hits a temporal dead zone. Import sorting cannot
// reorder a setup file ahead of the test file.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

globalThis.safeStructuredClone = (value: unknown) => structuredClone(value)

const publicDir = resolve(process.env.POCKETRISU_ROOT ?? '', 'public')

globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href)
    if (url.origin !== location.origin) {
        throw new Error(`PocketRisu oracle blocked a network request to ${url.href}`)
    }
    try {
        return new Response(
            await readFile(resolve(publicDir, `.${decodeURIComponent(url.pathname)}`)),
        )
    } catch {
        return new Response(null, { status: 404 })
    }
}

await import('src/ts/stores.svelte')

import { isAbsolute, join } from 'node:path'

/** Resolves a `with { type: 'file' }` import, which bundled builds emit relative to the bundle. */
export function bundledFilePath(path: string): string {
    if (path.startsWith('$bunfs/') || isAbsolute(path)) return path
    return join(import.meta.dir, path)
}

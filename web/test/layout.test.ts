import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

const testRoot = import.meta.dir
const srcRoot = join(testRoot, '..', 'src')
const notMirrored = new Set(['helpers', 'pocketrisu-parity'])

function testFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return testFiles(path)
        return /\.test\.tsx?$/.test(entry.name) ? [path] : []
    })
}

function moduleExists(directory: string, name: string) {
    return ['.ts', '.tsx'].some((extension) => existsSync(join(directory, name + extension)))
}

/** `x/y.test.ts` tests `src/x/y.ts`, `src/x/<prefix>.ts` for `y` = `<prefix>-<topic>`, or `src/x/index.ts` for `y` = `x`. */
function hasSubject(testPath: string) {
    const relativeDirectory = dirname(relative(testRoot, testPath))
    const sourceDirectory = join(srcRoot, relativeDirectory)
    const name = basename(testPath).replace(/\.test\.tsx?$/, '')
    const parts = name.split('-')
    const prefixes = parts.map((_, index) => parts.slice(0, index + 1).join('-'))
    return prefixes.some(
        (prefix) =>
            moduleExists(sourceDirectory, prefix) ||
            (prefix === basename(relativeDirectory) && moduleExists(sourceDirectory, 'index')),
    )
}

describe('test layout', () => {
    test('mirrors a src module in every test path', () => {
        const orphans = testFiles(testRoot)
            .filter((path) => {
                const [top] = relative(testRoot, path).split('/')
                return dirname(path) !== testRoot && !notMirrored.has(top!)
            })
            .filter((path) => !hasSubject(path))
            .map((path) => relative(testRoot, path))
        expect(orphans).toEqual([])
    })
})

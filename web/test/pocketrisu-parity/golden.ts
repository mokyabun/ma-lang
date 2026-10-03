import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DisplayCase, OracleResponse } from '../../../scripts/pocketrisu-oracle/protocol'

export const GOLDEN_PATH = join(import.meta.dir, 'pocketrisu-golden.json')

export interface GoldenFile {
    pocketRisuVersion: string
    pocketRisuCommit: string
    cases: Record<string, { inputHash: string; html: string }>
}

/** Detects a case edited without regenerating its PocketRisu output. */
export function caseHash(entry: DisplayCase): string {
    return createHash('sha256').update(JSON.stringify(entry)).digest('hex').slice(0, 16)
}

export function readGolden(): GoldenFile | undefined {
    if (!existsSync(GOLDEN_PATH)) return undefined
    return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenFile
}

export function writeGolden(cases: DisplayCase[], response: OracleResponse): GoldenFile {
    const failures = response.results.filter((result) => result.error !== undefined)
    if (failures.length) {
        throw new Error(
            `PocketRisu failed to render ${failures.length} case(s):\n` +
                failures.map((result) => `- ${result.id}: ${result.error}`).join('\n'),
        )
    }
    const html = new Map(response.results.map((result) => [result.id, result.html ?? '']))
    const golden: GoldenFile = {
        pocketRisuVersion: response.pocketRisuVersion,
        pocketRisuCommit: response.pocketRisuCommit,
        cases: Object.fromEntries(
            cases.map((entry) => [
                entry.id,
                { inputHash: caseHash(entry), html: html.get(entry.id) ?? '' },
            ]),
        ),
    }
    writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 4)}\n`)
    return golden
}

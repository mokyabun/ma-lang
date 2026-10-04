// Live comparison against a PocketRisu checkout (opt-in: PARITY_LIVE=1). It
// verifies the committed golden file still matches PocketRisu and fuzzes random
// compositions of corpus fragments to surface differences the corpus misses.
// PARITY_FUZZ_SEED / PARITY_FUZZ_COUNT reproduce or widen a fuzz run.
import { beforeAll, describe, expect, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
    pocketRisuOracleUnavailableReason,
    runPocketRisuOracle,
} from '../../../scripts/pocketrisu-oracle'
import type { DisplayCase, OracleResponse } from '../../../scripts/pocketrisu-oracle/protocol'
import { canonicalHtml } from './canonical-html'
import { parityCases } from './cases'
import { installHappyDom } from './dom'
import { fuzzCases } from './fuzz'
import { readGolden } from './golden'
import { isKnownDeviation } from './known-deviations'

const LIVE = process.env.PARITY_LIVE === '1'
const STRICT = process.env.PARITY_STRICT === '1'
const unavailable = LIVE ? pocketRisuOracleUnavailableReason() : 'PARITY_LIVE is not set'
const seed = Number(process.env.PARITY_FUZZ_SEED ?? 1)
const count = Number(process.env.PARITY_FUZZ_COUNT ?? 200)
const REPORT_PATH = join(import.meta.dir, 'fuzz-report.local.json')

const fuzz = fuzzCases(seed, Math.ceil(count * 0.7), Math.floor(count * 0.3))
let oracle: OracleResponse
let renderWithMalang: typeof import('./malang-renderer').renderWithMalang

if (LIVE && unavailable) {
    test('PocketRisu oracle is available', () => {
        throw new Error(unavailable)
    })
}

describe.skipIf(!!unavailable)('live PocketRisu oracle', () => {
    beforeAll(async () => {
        oracle = runPocketRisuOracle([...parityCases, ...fuzz])
        installHappyDom()
        ;({ renderWithMalang } = await import('./malang-renderer'))
    }, 600_000)

    test('committed golden file matches the current PocketRisu checkout', () => {
        const golden = readGolden()
        const html = new Map(oracle.results.map((result) => [result.id, result.html ?? '']))
        const changed = parityCases
            .filter(
                (entry) =>
                    canonicalHtml(html.get(entry.id) ?? '') !==
                    canonicalHtml(golden?.cases[entry.id]?.html ?? ''),
            )
            .map((entry) => entry.id)
        expect(
            changed,
            `PocketRisu ${oracle.pocketRisuVersion} renders these differently; run \`bun run pocketrisu:golden\``,
        ).toEqual([])
    })

    test(`fuzzed inputs render identically (seed ${seed}, ${fuzz.length} cases)`, async () => {
        const errors = oracle.results.filter(
            (result) => result.error && result.id.startsWith('fuzz/'),
        )
        expect(errors.map((result) => `${result.id}: ${result.error}`)).toEqual([])

        const expected = new Map(oracle.results.map((result) => [result.id, result.html ?? '']))
        const mismatches: Array<{ entry: DisplayCase; pocketRisu: string; malang: string }> = []
        for (const entry of fuzz) {
            const pocketRisu = canonicalHtml(expected.get(entry.id) ?? '')
            const malang = canonicalHtml(await renderWithMalang(entry))
            if (pocketRisu === malang) continue
            const input = entry.kind === 'markup' ? entry.input : JSON.stringify(entry.scenario)
            if (!STRICT && isKnownDeviation(input, pocketRisu, malang)) continue
            mismatches.push({ entry, pocketRisu, malang })
        }
        writeFileSync(REPORT_PATH, `${JSON.stringify({ seed, mismatches }, null, 2)}\n`)
        expect(
            mismatches.length,
            `${mismatches.length}/${fuzz.length} fuzzed cases differ; details in ${REPORT_PATH}`,
        ).toBe(0)
    })
})

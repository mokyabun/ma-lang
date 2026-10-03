// Message rendering parity with PocketRisu. Expected HTML comes from the real
// PocketRisu parser (see scripts/pocketrisu-oracle); regenerate it with
// `bun run pocketrisu:golden` after changing cases or upgrading PocketRisu.
import { beforeAll, describe, expect, test } from 'bun:test'

import { canonicalHtml } from './canonical-html'
import { parityCases } from './cases'
import { installHappyDom } from './dom'
import { caseHash, readGolden } from './golden'
import { KNOWN_DEVIATIONS } from './known-deviations'

const STRICT = process.env.PARITY_STRICT === '1'

let renderWithMalang: typeof import('./malang-renderer').renderWithMalang

beforeAll(async () => {
    installHappyDom()
    ;({ renderWithMalang } = await import('./malang-renderer'))
})

const golden = readGolden()

describe('PocketRisu parity suite', () => {
    test('golden file exists and covers every case with current inputs', () => {
        expect(golden, 'pocketrisu-golden.json is missing').toBeDefined()
        const stale = parityCases
            .filter((entry) => golden?.cases[entry.id]?.inputHash !== caseHash(entry))
            .map((entry) => entry.id)
        expect(stale, 'run `bun run pocketrisu:golden` to refresh these cases').toEqual([])
    })

    test('known deviations only name existing cases', () => {
        const ids = new Set(parityCases.map((entry) => entry.id))
        expect(Object.keys(KNOWN_DEVIATIONS).filter((id) => !ids.has(id))).toEqual([])
    })
})

describe(`message rendering matches PocketRisu ${golden?.pocketRisuVersion ?? ''}`, () => {
    for (const entry of parityCases) {
        const expected = golden?.cases[entry.id]
        const deviation = STRICT ? undefined : KNOWN_DEVIATIONS[entry.id]
        const run = deviation ? test.failing : test
        run.skipIf(!expected)(
            deviation ? `${entry.id} — known: ${deviation}` : entry.id,
            async () => {
                const actual = await renderWithMalang(entry)
                expect(canonicalHtml(actual)).toBe(canonicalHtml(expected!.html))
            },
        )
    }
})

// Regenerates pocketrisu-golden.json by rendering every parity case with the
// real PocketRisu parser. Requires a PocketRisu checkout with dependencies
// (default ../extra/PocketRisu, override with POCKETRISU_ROOT).
import { runPocketRisuOracle } from '../../../scripts/pocketrisu-oracle'
import { parityCases } from './cases'
import { GOLDEN_PATH, writeGolden } from './golden'

const ids = new Set<string>()
for (const entry of parityCases) {
    if (ids.has(entry.id)) throw new Error(`Duplicate parity case id: ${entry.id}`)
    ids.add(entry.id)
}

const golden = writeGolden(parityCases, runPocketRisuOracle(parityCases))
console.log(
    `Wrote ${Object.keys(golden.cases).length} cases from PocketRisu ` +
        `${golden.pocketRisuVersion} (${golden.pocketRisuCommit.slice(0, 8)}) to ${GOLDEN_PATH}`,
)

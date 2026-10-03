import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { pocketRisuIdentity, pocketRisuOracleUnavailableReason, pocketRisuRoot } from './index'
import type { OracleResponse, OracleResult, RequestCase } from './protocol'

const oracleDir = dirname(fileURLToPath(import.meta.url))

/**
 * Assembles every case's prompt with PocketRisu's real sendChat. All cases
 * share one Vitest process because loading PocketRisu's module graph dominates
 * the runtime.
 */
export function runPocketRisuRequestOracle(cases: RequestCase[]): OracleResponse {
    const unavailable = pocketRisuOracleUnavailableReason()
    if (unavailable) throw new Error(unavailable)

    const workDir = mkdtempSync(join(tmpdir(), 'pocketrisu-request-oracle-'))
    const requestPath = join(workDir, 'request.json')
    const responsePath = join(workDir, 'response.json')
    try {
        writeFileSync(requestPath, JSON.stringify({ cases }))
        const run = spawnSync(
            process.env.POCKETRISU_NODE ?? 'node',
            [
                join(pocketRisuRoot, 'node_modules/vitest/vitest.mjs'),
                'run',
                '--config',
                join(oracleDir, 'request.vitest.config.mts'),
            ],
            {
                cwd: pocketRisuRoot,
                encoding: 'utf8',
                maxBuffer: 256 * 1024 * 1024,
                env: {
                    ...process.env,
                    POCKETRISU_ROOT: pocketRisuRoot,
                    POCKETRISU_ORACLE_REQUEST: requestPath,
                    POCKETRISU_ORACLE_RESPONSE: responsePath,
                },
            },
        )
        if (run.status !== 0 || !existsSync(responsePath)) {
            throw new Error(
                `PocketRisu request oracle failed (exit ${run.status ?? run.signal})\n${run.stdout.slice(-20_000)}\n${run.stderr.slice(-20_000)}`,
            )
        }
        const { results } = JSON.parse(readFileSync(responsePath, 'utf8')) as {
            results: OracleResult[]
        }
        return { ...pocketRisuIdentity(), results }
    } finally {
        rmSync(workDir, { recursive: true, force: true })
    }
}

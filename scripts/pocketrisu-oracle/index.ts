import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { OracleCase, OracleResponse, OracleResult } from './protocol'

export type * from './protocol'

const oracleDir = dirname(fileURLToPath(import.meta.url))

export const pocketRisuRoot = resolve(
    process.env.POCKETRISU_ROOT ?? resolve(oracleDir, '../../extra/PocketRisu'),
)

const vitestBin = join(pocketRisuRoot, 'node_modules/vitest/vitest.mjs')

/** The oracle needs a PocketRisu checkout with its dependencies installed. */
export function pocketRisuOracleUnavailableReason(): string | undefined {
    if (!existsSync(join(pocketRisuRoot, 'src/ts/parser/parser.svelte.ts'))) {
        return `PocketRisu source not found at ${pocketRisuRoot} (set POCKETRISU_ROOT)`
    }
    if (!existsSync(vitestBin)) {
        return `PocketRisu dependencies are not installed (run pnpm install in ${pocketRisuRoot})`
    }
    return undefined
}

/**
 * Renders every case with PocketRisu's real parser. All cases share one Vitest
 * process because starting PocketRisu's module graph dominates the runtime.
 */
export function runPocketRisuOracle(cases: OracleCase[]): OracleResponse {
    const unavailable = pocketRisuOracleUnavailableReason()
    if (unavailable) throw new Error(unavailable)

    const workDir = mkdtempSync(join(tmpdir(), 'pocketrisu-oracle-'))
    const requestPath = join(workDir, 'request.json')
    const responsePath = join(workDir, 'response.json')
    try {
        writeFileSync(requestPath, JSON.stringify({ cases }))
        const run = spawnSync(
            process.env.POCKETRISU_NODE ?? 'node',
            [vitestBin, 'run', '--config', join(oracleDir, 'vitest.config.mts')],
            {
                cwd: pocketRisuRoot,
                encoding: 'utf8',
                maxBuffer: 64 * 1024 * 1024,
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
                `PocketRisu oracle failed (exit ${run.status ?? run.signal})\n${run.stdout}\n${run.stderr}`,
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

export function pocketRisuIdentity() {
    const pkg = JSON.parse(readFileSync(join(pocketRisuRoot, 'package.json'), 'utf8')) as {
        version: string
    }
    const commit = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: pocketRisuRoot,
        encoding: 'utf8',
    })
    return {
        pocketRisuVersion: pkg.version,
        pocketRisuCommit: commit.status === 0 ? commit.stdout.trim() : 'unknown',
    }
}

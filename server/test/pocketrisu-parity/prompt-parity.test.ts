import { beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
    GeminiPrompt,
    PromptMessage,
    PromptScenario,
} from '../../../scripts/pocketrisu-oracle/protocol'
import { runPocketRisuRequestOracle } from '../../../scripts/pocketrisu-oracle/request'
import { compileWithMalang } from './malang'
import { promptScenarios } from './scenarios'

// Malang must produce exactly PocketRisu's sendChat prompt and Gemini body.
// POCKETRISU_ORACLE: unset = golden file, `live` = run PocketRisu, `record` = rewrite the golden file.

interface GoldenCase {
    scenarioHash: string
    messages?: PromptMessage[]
    geminiPrompt?: GeminiPrompt
    error?: string
}

interface GoldenFile {
    pocketRisuVersion: string
    pocketRisuCommit: string
    cases: Record<string, GoldenCase>
}

const goldenPath = join(import.meta.dir, 'prompt-requests.golden.json')
const mode = process.env.POCKETRISU_ORACLE

const hashScenario = (scenario: PromptScenario) =>
    createHash('sha256').update(JSON.stringify(scenario)).digest('hex').slice(0, 16)

function runOracle(): GoldenFile {
    const response = runPocketRisuRequestOracle(
        Object.entries(promptScenarios).map(([id, scenario]) => ({
            kind: 'request' as const,
            id,
            scenario,
        })),
    )
    const results = new Map(response.results.map((result) => [result.id, result]))
    return {
        pocketRisuVersion: response.pocketRisuVersion,
        pocketRisuCommit: response.pocketRisuCommit,
        cases: Object.fromEntries(
            Object.entries(promptScenarios).map(([id, scenario]) => {
                const result = results.get(id)
                return [
                    id,
                    {
                        scenarioHash: hashScenario(scenario),
                        ...(result?.messages && result.geminiPrompt
                            ? { messages: result.messages, geminiPrompt: result.geminiPrompt }
                            : { error: result?.error ?? 'No oracle result' }),
                    },
                ]
            }),
        ),
    }
}

function loadGolden(): GoldenFile | null {
    if (!existsSync(goldenPath)) return null
    return JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenFile
}

/** One readable block per message, so a mismatch shows as a line diff. */
const transcript = (messages: PromptMessage[]) =>
    messages.map((message, index) => `#${index} [${message.role}]\n${message.content}`).join('\n\n')

describe('PocketRisu prompt request parity', () => {
    let golden: GoldenFile | null = null

    beforeAll(() => {
        if (mode === 'live' || mode === 'record') {
            golden = runOracle()
            if (mode === 'record') {
                writeFileSync(goldenPath, `${JSON.stringify(golden, null, 4)}\n`)
            }
        } else {
            golden = loadGolden()
        }
    }, 600_000)

    function recording(id: string, scenario: PromptScenario) {
        const expected = golden?.cases[id]
        if (!expected || expected.scenarioHash !== hashScenario(scenario)) {
            throw new Error(
                `No current PocketRisu recording for "${id}"; run \`bun run test:parity:record\` in server/`,
            )
        }
        if (!expected.messages || !expected.geminiPrompt) {
            throw new Error(`PocketRisu failed to render "${id}":\n${expected.error}`)
        }
        return { messages: expected.messages, geminiPrompt: expected.geminiPrompt }
    }

    for (const [id, scenario] of Object.entries(promptScenarios)) {
        describe(id, () => {
            test('request messages', async () => {
                const expected = recording(id, scenario)
                const { messages } = await compileWithMalang(scenario)
                expect(transcript(messages)).toBe(transcript(expected.messages))
                expect(messages).toEqual(expected.messages)
            })

            test('Gemini body prompt', async () => {
                const expected = recording(id, scenario)
                const { geminiPrompt } = await compileWithMalang(scenario)
                expect(geminiPrompt).toEqual(expected.geminiPrompt)
            })
        })
    }
})

/**
 * Wire format shared by Malang's parity tests and the PocketRisu oracle runner.
 * Type-only: both sides import it, and the runner executes inside PocketRisu's
 * own Vitest toolchain where Malang's runtime modules are unavailable.
 */

/** A string that has already passed through CBS and regex processing. */
export interface MarkupCase {
    kind: 'markup'
    id: string
    input: string
}

export interface ScenarioRegexScript {
    comment?: string
    in: string
    out: string
    /** PocketRisu flag text such as `gi` or `g<order 2,move_top>`; empty means the default `g`. */
    flag?: string
}

export interface MessageScenario {
    userName: string
    charName: string
    messages: Array<{ role: 'user' | 'char'; content: string }>
    /** Message index rendered through the full chat pipeline. */
    index: number
    chatVariables?: Record<string, string>
    globalVariables?: Record<string, string>
    /** Character `editdisplay` scripts. */
    regex?: ScenarioRegexScript[]
}

/** A stored chat message rendered through CBS, editdisplay regex and markup. */
export interface MessageCase {
    kind: 'message'
    id: string
    scenario: MessageScenario
}

export type DisplayCase = MarkupCase | MessageCase
export type OracleCase = DisplayCase

export interface OracleRequest {
    cases: OracleCase[]
}

export interface OracleResult {
    id: string
    html?: string
    error?: string
}

export interface OracleResponse {
    pocketRisuVersion: string
    pocketRisuCommit: string
    results: OracleResult[]
}

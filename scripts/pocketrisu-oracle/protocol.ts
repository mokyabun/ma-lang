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

/**
 * A chat described with PocketRisu-native data, so each side loads it through
 * its own import path: PocketRisu through importPreset/importCharacterProcess,
 * Malang through its preset, card and module codecs.
 */
export interface PromptScenario {
    /** botPreset JSON as PocketRisu exports it; merged over presetTemplate on import. */
    preset: Record<string, unknown>
    /** Character Card V3 (`chara_card_v3`) JSON. */
    character: Record<string, unknown>
    /** `risuModule` JSON exports, all enabled globally. */
    modules?: Record<string, unknown>[]
    user: {
        name: string
        /** Persona prompt; empty or omitted means no persona text. */
        persona?: string
    }
    chat: {
        /** The greeting is not listed here; PocketRisu derives it from `fmIndex`. */
        messages: Array<{ role: 'user' | 'char'; data: string }>
        /** -1 selects `first_mes`, otherwise an `alternate_greetings` index. */
        fmIndex?: number
        /** Author's note. */
        note?: string
        /** Chat variables by bare name; PocketRisu stores them as `$name`. */
        variables?: Record<string, string>
    }
    globalVariables?: Record<string, string>
    /** Prompt toggle values by key; PocketRisu stores them as `toggle_<key>` globals. */
    toggles?: Record<string, string>
    jailbreakToggle?: boolean
    chainOfThought?: boolean
    /** Model preset token budget; omitted means neither side trims history. */
    context?: { maxContext: number; maxResponse: number }
}

/** The prompt PocketRisu's sendChat would hand to the request layer. */
export interface RequestCase {
    kind: 'request'
    id: string
    scenario: PromptScenario
}

export type DisplayCase = MarkupCase | MessageCase
export type OracleCase = DisplayCase | RequestCase

export interface OracleRequest {
    cases: OracleCase[]
}

export interface PromptMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

/** The prompt-carrying fields of a Gemini `generateContent` request body. */
export interface GeminiPrompt {
    systemInstruction?: unknown
    contents: unknown[]
}

export interface OracleResult {
    id: string
    html?: string
    /** Request cases: the prompt sendChat hands to the request layer. */
    messages?: PromptMessage[]
    /** Request cases: the same prompt as the Gemini Model Preset adapter puts it on the wire. */
    geminiPrompt?: GeminiPrompt
    error?: string
}

export interface OracleResponse {
    pocketRisuVersion: string
    pocketRisuCommit: string
    results: OracleResult[]
}

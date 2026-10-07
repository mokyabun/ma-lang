// Executed by PocketRisu's own Vitest toolchain (see request.vitest.config.mts).
// Loads each scenario through PocketRisu's real import paths, binds the chat to
// a bundled Gemini Model Preset, and captures sendChat's two built-in previews:
// `preview` stops right before the request layer, `previewPrompt` returns the
// request the Model Preset adapter would send.
//
// request-setup.ts loads stores.svelte before this file's imports.

import { readFileSync, writeFileSync } from 'node:fs'

import { importCharacterProcess } from 'src/ts/characterCards'
import { loadBundledRegistry, resolveSnapshot } from 'src/ts/preset/registry'
import { emptyModelBinding } from 'src/ts/preset/types'
import * as chatProcess from 'src/ts/process/index.svelte'
import { refreshModules } from 'src/ts/process/modules'
import { resetScriptCache } from 'src/ts/process/scripts'
import { changeToPreset, importPreset, setDatabase } from 'src/ts/storage/database.svelte'
import { DBState, selectedCharID } from 'src/ts/stores.svelte'
import { test } from 'vitest'

import type {
    GeminiPrompt,
    OracleRequest,
    OracleResult,
    PromptScenario,
    RequestCase,
} from './protocol'

const encoder = new TextEncoder()

// Large enough that neither side trims history unless a scenario sets a budget.
const UNLIMITED_CONTEXT = 10_000_000

// An API-key profile, so building the preview request needs no OAuth exchange.
const GEMINI_PROFILE_ID = 'google:gemini-3-flash'
const GEMINI_PRESET_ID = 'pocketrisu-oracle-gemini'

async function loadScenario(scenario: PromptScenario) {
    setDatabase({} as never)
    const db = DBState.db

    const characterIndex = await importCharacterProcess({
        name: 'character.json',
        data: encoder.encode(JSON.stringify(scenario.character)),
    })
    if (typeof characterIndex !== 'number')
        throw new Error('PocketRisu rejected the character card')
    const character = db.characters[characterIndex]
    const chat = character.chats[character.chatPage]
    chat.message = scenario.chat.messages.map((message) => ({ ...message }))
    chat.fmIndex = scenario.chat.fmIndex ?? -1
    chat.note = scenario.chat.note ?? ''
    chat.scriptstate = Object.fromEntries(
        Object.entries(scenario.chat.variables ?? {}).map(([key, value]) => [`$${key}`, value]),
    )
    chat.useModelPreset = true
    chat.modelBinding = { ...emptyModelBinding(), main: GEMINI_PRESET_ID, sub: GEMINI_PRESET_ID }
    db.modelPresets = [
        {
            id: GEMINI_PRESET_ID,
            name: 'Oracle Gemini',
            profileSnapshot: resolveSnapshot(loadBundledRegistry(), GEMINI_PROFILE_ID),
            userValues: {
                apiKey: 'pocketrisu-oracle',
                ...(scenario.context ? { maxOutputTokens: scenario.context.maxResponse } : {}),
            },
            maxContext: scenario.context?.maxContext ?? UNLIMITED_CONTEXT,
            createdAt: 0,
            updatedAt: 0,
        },
    ]
    selectedCharID.set(characterIndex)

    // importModule's `risuModule` JSON branch, then enable it globally.
    for (const source of scenario.modules ?? []) {
        const module = structuredClone(source) as { id: string }
        module.id = crypto.randomUUID()
        db.modules.push(module as never)
        db.enabledModules.push(module.id)
    }

    await importPreset({
        name: 'preset.json',
        data: encoder.encode(JSON.stringify(scenario.preset)),
    })
    changeToPreset(db.botPresets.length - 1, false)

    // Applied after changeToPreset, which reloads toggles saved on the chat.
    db.username = scenario.user.name
    db.personaPrompt = scenario.user.persona ?? ''
    db.globalChatVariables = {
        ...scenario.globalVariables,
        ...Object.fromEntries(
            Object.entries(scenario.toggles ?? {}).map(([key, value]) => [`toggle_${key}`, value]),
        ),
    }
    db.jailbreakToggle = scenario.jailbreakToggle ?? false
    db.chainOfThought = scenario.chainOfThought ?? false
    db.maxContext = UNLIMITED_CONTEXT

    // Module-level caches are keyed by ids and text only.
    refreshModules()
    resetScriptCache()
}

async function renderRequest(entry: RequestCase): Promise<OracleResult> {
    try {
        // sendChat persists CBS side effects (setvar) into the chat, so every
        // preview starts from a freshly loaded scenario.
        await loadScenario(entry.scenario)
        if (!(await chatProcess.sendChat(-1, { preview: true, continue: entry.scenario.continue }))) {
            throw new Error('sendChat preview returned false')
        }
        const messages = chatProcess.previewFormated.map((message) => {
            if (message.role === 'function') throw new Error('Unexpected function message')
            return { role: message.role, content: message.content }
        })

        await loadScenario(entry.scenario)
        if (
            !(await chatProcess.sendChat(-1, {
                previewPrompt: true,
                continue: entry.scenario.continue,
            }))
        ) {
            throw new Error('sendChat previewPrompt returned false')
        }
        const { body } = JSON.parse(chatProcess.previewBody) as { body: Record<string, unknown> }
        const geminiPrompt: GeminiPrompt = {
            ...(body.systemInstruction ? { systemInstruction: body.systemInstruction } : {}),
            contents: body.contents as unknown[],
        }
        return { id: entry.id, messages, geminiPrompt }
    } catch (error) {
        return {
            id: entry.id,
            error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error),
        }
    }
}

test('render PocketRisu request cases', async () => {
    const requestPath = process.env.POCKETRISU_ORACLE_REQUEST
    const responsePath = process.env.POCKETRISU_ORACLE_RESPONSE
    if (!requestPath || !responsePath) {
        throw new Error('POCKETRISU_ORACLE_REQUEST and POCKETRISU_ORACLE_RESPONSE are required')
    }
    const request = JSON.parse(readFileSync(requestPath, 'utf8')) as OracleRequest
    const results: OracleResult[] = []
    for (const entry of request.cases) {
        if (entry.kind !== 'request') throw new Error(`Unsupported case kind ${entry.kind}`)
        results.push(await renderRequest(entry))
    }
    writeFileSync(responsePath, JSON.stringify({ results }))
}, 600_000)

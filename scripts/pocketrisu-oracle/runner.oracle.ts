// Executed by PocketRisu's own Vitest toolchain (see vitest.config.mts). It
// renders every requested case with the unmodified PocketRisu parser and writes
// the HTML that ChatBody.svelte would hand to {@html}.
import { readFileSync, writeFileSync } from 'node:fs'

import {
    addMetadataToElement,
    ParseMarkdown,
    risuChatParser,
    trimMarkdown,
} from 'src/ts/parser/parser.svelte'
import { resetScriptCache } from 'src/ts/process/scripts'
import { setDatabase } from 'src/ts/storage/database.svelte'
import { test } from 'vitest'

import type { MessageScenario, OracleCase, OracleRequest, OracleResult } from './protocol'
import { createSimpleCharacter, DBState, selectedCharID, selIdState } from './stubs/stores'

const ORACLE_CHARACTER_ID = 'pocketrisu-oracle-character'

function buildDatabase(scenario: MessageScenario) {
    const scriptstate = Object.fromEntries(
        Object.entries(scenario.chatVariables ?? {}).map(([key, value]) => [`$${key}`, value]),
    )
    const customscript = (scenario.regex ?? []).map((script) => ({
        comment: script.comment ?? '',
        in: script.in,
        out: script.out,
        type: 'editdisplay',
        flag: script.flag ?? '',
        ableFlag: !!script.flag,
    }))
    const character = {
        type: 'character',
        chaId: ORACLE_CHARACTER_ID,
        name: scenario.charName,
        firstMessage: '',
        alternateGreetings: [],
        chatPage: 0,
        chats: [
            {
                id: 'pocketrisu-oracle-chat',
                name: 'Oracle',
                message: scenario.messages.map((message) => ({
                    role: message.role,
                    data: message.content,
                })),
                note: '',
                localLore: [],
                fmIndex: -1,
                modules: [],
                scriptstate,
            },
        ],
        customscript,
        triggerscript: [],
        additionalAssets: [],
        emotionImages: [],
        defaultVariables: '',
        virtualscript: '',
        modules: [],
        lowLevelAccess: false,
    }
    // Everything else is filled with PocketRisu's own defaults by setDatabase().
    return {
        characters: [character],
        username: scenario.userName,
        globalChatVariables: { ...scenario.globalVariables },
    }
}

const EMPTY_SCENARIO: MessageScenario = {
    userName: 'User',
    charName: 'Char',
    messages: [],
    index: -1,
}

function loadScenario(scenario: MessageScenario) {
    setDatabase(buildDatabase(scenario) as never)
    selIdState.selId = 0
    selectedCharID.set(0)
    // processScriptFull memoizes by text and scripts only; chat variables are
    // per scenario here, so a stale hit would leak state between cases.
    resetScriptCache()
}

/** Chats.svelte → Chat.svelte (displaya) → ChatBody.svelte (markParsing + {@html}). */
async function renderMessage(scenario: MessageScenario): Promise<string> {
    loadScenario(scenario)
    const message = scenario.messages[scenario.index]
    if (!message) throw new Error(`Scenario index ${scenario.index} has no message`)
    const cbsConditions = { firstmsg: false, chatRole: message.role }
    const msgDisplay = risuChatParser(message.content, {
        chara: message.role === 'user' ? scenario.userName : scenario.charName,
        chatID: scenario.index,
        rmVar: true,
        visualize: true,
        cbsConditions,
    })
    const character = createSimpleCharacter(DBState.db.characters[0])
    const parsed = await ParseMarkdown(
        msgDisplay,
        character as never,
        'notrim',
        scenario.index,
        cbsConditions,
    )
    return addMetadataToElement(trimMarkdown(parsed), '')
}

/** Text that already passed CBS and regex, rendered without a character. */
async function renderMarkup(input: string): Promise<string> {
    loadScenario(EMPTY_SCENARIO)
    return addMetadataToElement(trimMarkdown(await ParseMarkdown(input, null, 'notrim')), '')
}

async function renderCase(entry: OracleCase): Promise<OracleResult> {
    try {
        const html =
            entry.kind === 'markup'
                ? await renderMarkup(entry.input)
                : await renderMessage(entry.scenario)
        return { id: entry.id, html }
    } catch (error) {
        return {
            id: entry.id,
            error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error),
        }
    }
}

test('render PocketRisu oracle cases', async () => {
    const requestPath = process.env.POCKETRISU_ORACLE_REQUEST
    const responsePath = process.env.POCKETRISU_ORACLE_RESPONSE
    if (!requestPath || !responsePath) {
        throw new Error('POCKETRISU_ORACLE_REQUEST and POCKETRISU_ORACLE_RESPONSE are required')
    }
    const request = JSON.parse(readFileSync(requestPath, 'utf8')) as OracleRequest
    const results: OracleResult[] = []
    for (const entry of request.cases) results.push(await renderCase(entry))
    writeFileSync(responsePath, JSON.stringify({ results }))
}, 600_000)

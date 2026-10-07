import type { RegexScript } from '@malang/shared'

import type { RisuParser } from './pocketrisu/parser'
import { processScripts, type RegexSandbox } from './pocketrisu/scripts'

/** PocketRisu's displaya(): rmVar/visualize parse, then processScriptFull (Lua editDisplay + editdisplay regex). */
export async function renderDisplayText(input: {
    parser: RisuParser
    content: string
    /** PocketRisu's chatID: the index in chat.message, or -1 for the greeting. */
    chatId: number
    scripts: RegexScript[]
    sandbox: RegexSandbox
    warnings: string[]
    /** Lua editDisplay, which PocketRisu runs between the two parses. */
    editDisplay?: (text: string) => Promise<string>
}): Promise<string> {
    const { parser, chatId } = input
    let data = parser.parse(input.content, { chatId, rmVar: true, visualize: true })
    if (input.editDisplay) data = await input.editDisplay(data)
    return processScripts({
        scripts: input.scripts,
        data,
        mode: 'editdisplay',
        chatId,
        parse: (text) => parser.parse(text, { chatId }),
        sandbox: input.sandbox,
        warnings: input.warnings,
    })
}

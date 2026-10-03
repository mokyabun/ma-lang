// Malang's side of the parity comparison: the same functions production uses,
// composed the way the server display batch and MessageContent compose them.
// Import only after installHappyDom().
import type { RegexScript } from '@malang/shared'

import type { MessageScenario, DisplayCase } from '../../../scripts/pocketrisu-oracle/protocol'
import { renderDisplayText } from '../../../server/src/services/prompt/display-text'
import type { TemplateContext } from '../../../server/src/services/prompt/template-engine'
import { renderMessageContentHtml } from '../../src/lib/render-message-content'

/** innerHTML of the `.chattext` element MessageContent renders. */
export async function renderWithMalang(entry: DisplayCase): Promise<string> {
    if (entry.kind === 'markup') return chattextHtml(entry.input, entry.input, entry.id)
    const { scenario } = entry
    const message = scenario.messages[scenario.index]
    if (!message) throw new Error(`Scenario index ${scenario.index} has no message`)
    const display = await renderDisplayText(
        message.content,
        scenarioRegexScripts(scenario),
        scenarioTemplateContext(scenario),
    )
    return chattextHtml(display, message.content, entry.id)
}

function chattextHtml(source: string, content: string, seed: string): string {
    const rendered = renderMessageContentHtml(source, [], seed)
    if (rendered) return rendered
    // MessageContent falls back to the raw stored text in a pre-wrap block.
    const text = document.createElement('div')
    text.textContent = content
    return text.innerHTML
}

/** Mirrors server/src/services/prompt/risu.ts importing a PocketRisu customscript. */
function scenarioRegexScripts(scenario: MessageScenario): RegexScript[] {
    return (scenario.regex ?? []).map((script, index) => ({
        id: `parity-regex-${index}`,
        comment: script.comment ?? '',
        pattern: script.in,
        replacement: script.out,
        phase: 'editdisplay',
        enabled: true,
        flags: script.flag ?? '',
    }))
}

/** Mirrors regexTemplateContext() for a display batch truncated at the rendered message. */
function scenarioTemplateContext(scenario: MessageScenario): TemplateContext {
    const messages = scenario.messages.slice(0, scenario.index + 1).map((message) => ({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: message.content,
    }))
    const latest = (role: string) =>
        [...messages].reverse().find((message) => message.role === role)?.content ?? ''
    return {
        values: {
            user: scenario.userName,
            char: scenario.charName,
            bot: scenario.charName,
            persona: '',
            description: '',
            personality: '',
            scenario: '',
            exampledialogue: '',
            examplemessage: '',
            firstmessage: '',
            authornote: '',
            globalnote: '',
            lastmessage: messages.at(-1)?.content ?? '',
            lastusermessage: latest('user'),
            lastcharmessage: latest('assistant'),
            lastmessageid: String(messages.length - 1),
        },
        variables: { ...scenario.chatVariables },
        globalVariables: { ...scenario.globalVariables },
        toggles: {},
        toggleValues: {},
        messages,
        moduleNamespaces: [],
        assets: [],
    }
}

// Malang's side of the parity comparison: the functions production uses, composed
// the way the server display batch (display.ts) and MessageContent compose them.
// Import only after installHappyDom().
import type {
    AppSettings,
    Character,
    Conversation,
    EffectivePersona,
    Message,
    PromptPreset,
} from '@malang/shared'

import type { DisplayCase, MessageScenario } from '../../../scripts/pocketrisu-oracle/protocol'
import { renderDisplayText } from '../../../server/src/services/prompt/display-text'
import { loadRisuChat } from '../../../server/src/services/prompt/pocketrisu/chat'
import { RegexSandbox } from '../../../server/src/services/prompt/pocketrisu/scripts'
import { renderMessageContentHtml } from '../../src/lib/render-message-content'

/** innerHTML of the `.chattext` element MessageContent renders. */
export async function renderWithMalang(entry: DisplayCase): Promise<string> {
    if (entry.kind === 'markup') return renderMessageContentHtml(entry.input, [], entry.id)
    const display = await renderScenarioDisplay(entry.scenario)
    return renderMessageContentHtml(display, [], entry.id)
}

/** display.ts for one scenario message, without Lua editDisplay. */
async function renderScenarioDisplay(scenario: MessageScenario): Promise<string> {
    // The oracle stores every scenario message in chat.message, while Malang treats a
    // leading assistant message as the greeting; scenarios therefore open with the user.
    if (scenario.messages[0]?.role !== 'user') {
        throw new Error('Parity scenarios must start with a user message')
    }
    const messages = scenario.messages.map(
        (message, index) =>
            ({
                id: `message-${index}`,
                role: message.role === 'user' ? 'user' : 'assistant',
                content: message.content,
                status: 'complete',
            }) as Message,
    )
    const target = messages[scenario.index]
    if (!target) throw new Error(`Scenario index ${scenario.index} has no message`)

    const warnings: string[] = []
    const { parser } = loadRisuChat({
        character: {
            name: scenario.charName,
            description: '',
            personality: '',
            scenario: '',
            exampleMessage: '',
            firstMessage: '',
            alternateGreetings: [],
            postHistoryInstructions: '',
            defaultVariables: {},
        } as unknown as Character,
        conversation: {
            variables: { ...scenario.chatVariables },
            authorNote: '',
            greetingIndex: -1,
        } as unknown as Conversation,
        messages,
        preset: { toggles: [], defaultVariables: {} } as unknown as PromptPreset,
        settings: {
            promptToggleValues: {},
            globalVariables: { ...scenario.globalVariables },
            jailbreakToggle: false,
        } as unknown as AppSettings,
        persona: { name: scenario.userName, description: '' } as EffectivePersona,
        modules: [],
        assets: [],
        assetRenderMode: 'display',
        warnings,
    })
    const sandbox = new RegexSandbox()
    try {
        return await renderDisplayText({
            parser,
            content: target.content,
            chatId: scenario.index,
            // Mirrors server/src/services/prompt/risu.ts importing a PocketRisu customscript.
            scripts: (scenario.regex ?? []).map((script, index) => ({
                id: `parity-regex-${index}`,
                comment: script.comment ?? '',
                pattern: script.in,
                replacement: script.out,
                phase: 'editdisplay',
                enabled: true,
                flags: script.flag ?? '',
            })),
            sandbox,
            warnings,
        })
    } finally {
        sandbox.close()
    }
}

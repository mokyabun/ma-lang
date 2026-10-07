import { createHash } from 'node:crypto'

import type { Store } from '@/db'
import type { LuaRuntime } from '@/services/lua'
import { renderDisplayText } from '@/services/prompt/display-text'
import { loadRisuChat } from '@/services/prompt/pocketrisu/chat'
import { RegexSandbox } from '@/services/prompt/pocketrisu/scripts'
import { collectRegexScripts } from '@/services/prompt/regex-runtime'

import type { GenerationContext } from './context'

export async function renderDisplayMessages(
    store: Store,
    lua: LuaRuntime,
    conversationId: string,
    context: GenerationContext,
) {
    const scripts = collectRegexScripts(context.preset, context.character, context.modules)
    const scriptSetHash = createHash('sha256')
        .update('pocketrisu-display-v2')
        .update(lua.scriptSetHash(conversationId))
        .update(JSON.stringify(scripts.filter((script) => script.phase === 'editdisplay')))
        .digest('hex')
    const epoch = context.conversation.displayEpoch
    const batch = { conversationId, displayEpoch: epoch, scriptSetHash }
    const cached = store.luaDisplayBatch.find(batch)
    if (cached?.status === 'complete' && cached.result_json) {
        return JSON.parse(cached.result_json) as GenerationContext['messages']
    }
    if (cached?.status === 'failed') throw new Error('The cached Lua display batch failed')
    if (!cached) store.luaDisplayBatch.start(batch)
    const warnings: string[] = []
    const { parser, greeting, chatMessages } = loadRisuChat({
        character: context.character,
        conversation: context.conversation,
        messages: context.messages,
        preset: context.preset,
        settings: context.settings,
        persona: context.persona,
        modules: context.modules,
        assets: context.assets,
        modelId: context.modelId,
        assetRenderMode: 'display',
        warnings,
    })
    const sandbox = new RegexSandbox()
    try {
        const eventKey = `display:${epoch}:${scriptSetHash}`
        const output = []
        for (const [index, message] of context.messages.entries()) {
            // Lua may change chat variables; PocketRisu always parses against the live chat.
            const variables = store.conversation.get(conversationId)?.variables
            if (variables) Object.assign(parser.variables, variables)
            const rendered = await renderDisplayText({
                parser,
                content: message.content,
                chatId: message === greeting ? -1 : chatMessages.indexOf(message),
                scripts,
                sandbox,
                warnings,
                editDisplay: async (data) => {
                    const luaDisplay = await lua.executeEvent({
                        conversationId,
                        eventKey,
                        phase: `editDisplay:${index}`,
                        mode: 'editDisplay',
                        data,
                        meta: { index },
                        // Display GETs have no UI command target, so editDisplay cannot use alerts.
                        clientInstanceId: '00000000-0000-4000-8000-000000000000',
                    })
                    return String(luaDisplay.data ?? '')
                },
            })
            output.push({
                ...message,
                ...(rendered === message.content ? {} : { displayContent: rendered }),
            })
        }
        store.luaDisplayBatch.complete(batch, output)
        return output
    } catch (error) {
        store.luaDisplayBatch.fail(batch, {
            message: error instanceof Error ? error.message : String(error),
        })
        throw error
    } finally {
        sandbox.close()
    }
}

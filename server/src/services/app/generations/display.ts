import { createHash } from 'node:crypto'

import type { Store } from '@/db'
import type { LuaRuntime } from '@/services/lua'
import { renderDisplayText } from '@/services/prompt/display-text'
import { collectRegexScripts } from '@/services/prompt/regex-runtime'

import { regexTemplateContext, type GenerationContext } from './context'

export async function renderDisplayMessages(
    store: Store,
    lua: LuaRuntime,
    conversationId: string,
    context: GenerationContext,
) {
    const scripts = collectRegexScripts(context.preset, context.character, context.modules)
    const scriptSetHash = createHash('sha256')
        .update('pocketrisu-display-assets-v1')
        .update(lua.scriptSetHash(conversationId))
        .update(JSON.stringify(scripts.filter((script) => script.phase === 'editdisplay')))
        .digest('hex')
    const epoch = context.conversation.displayEpoch
    const cached = store.sqlite
        .query<
            { status: string; result_json: string | null; error_json: string | null },
            [string, number, string]
        >(
            `SELECT status, result_json, error_json FROM lua_display_batches
             WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
        )
        .get(conversationId, epoch, scriptSetHash)
    if (cached?.status === 'complete' && cached.result_json) {
        return JSON.parse(cached.result_json) as GenerationContext['messages']
    }
    if (cached?.status === 'failed') throw new Error('The cached Lua display batch failed')
    if (!cached) {
        store.sqlite
            .query(
                `INSERT INTO lua_display_batches
                 (conversation_id, display_epoch, script_set_hash, status, created_at)
                 VALUES (?, ?, ?, 'running', ?)`,
            )
            .run(conversationId, epoch, scriptSetHash, Date.now())
    }
    try {
        const eventKey = `display:${epoch}:${scriptSetHash}`
        const output = []
        for (const [index, message] of context.messages.entries()) {
            const luaDisplay = await lua.executeEvent({
                conversationId,
                eventKey,
                phase: `editDisplay:${index}`,
                mode: 'editDisplay',
                data: message.content,
                meta: { index },
                // A display GET has no initiating UI command target. editDisplay cannot use alerts.
                clientInstanceId: '00000000-0000-4000-8000-000000000000',
            })
            const perMessageContext = {
                ...context,
                messages: context.messages.slice(0, index + 1),
                conversation: store.conversation.get(conversationId) ?? context.conversation,
            }
            const rendered = await renderDisplayText(
                String(luaDisplay.data ?? ''),
                scripts,
                regexTemplateContext(perMessageContext),
            )
            output.push({
                ...message,
                ...(rendered === message.content ? {} : { displayContent: rendered }),
            })
        }
        store.sqlite
            .query(
                `UPDATE lua_display_batches SET status = 'complete', result_json = ?, completed_at = ?
                 WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
            )
            .run(JSON.stringify(output), Date.now(), conversationId, epoch, scriptSetHash)
        return output
    } catch (error) {
        store.sqlite
            .query(
                `UPDATE lua_display_batches SET status = 'failed', error_json = ?, completed_at = ?
                 WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
            )
            .run(
                JSON.stringify({
                    message: error instanceof Error ? error.message : String(error),
                }),
                Date.now(),
                conversationId,
                epoch,
                scriptSetHash,
            )
        throw error
    }
}

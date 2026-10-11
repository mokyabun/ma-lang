import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { CharacterCreateSchema } from '@malang/shared'

import { createTestApp } from '../../helpers/app'
import { fixturePath } from '../../helpers/fixtures'

const t = await createTestApp({ login: false })
afterAll(() => t.close())

describe('PocketRisu Lua runtime', () => {
    let conversationId: string

    beforeEach(() => {
        const character = t.context.characters.create(
            CharacterCreateSchema.parse({
                name: 'Lua fixture',
                defaultVariables: { fallback_value: 'character-default', choice: '0' },
                luaScript: {
                    code: readFileSync(fixturePath('lua-runtime.lua'), 'utf8'),
                    enabled: true,
                    lowLevelAccess: true,
                },
            }),
        )
        conversationId = t.context.conversations.create({
            characterId: character.id,
            greetingIndex: -1,
        }).id
    })

    test('runs a manual invocation once per idempotency key', async () => {
        const key = crypto.randomUUID()
        const request = {
            type: 'manual' as const,
            name: 'initialize',
            idempotencyKey: key,
            clientInstanceId: crypto.randomUUID(),
            sourceMessageId: null,
            triggerElementId: 'init',
        }
        await t.context.lua.trigger(conversationId, request)
        expect(t.context.store.conversation.get(conversationId)?.variables).toMatchObject({
            initialized: '1',
            choice: '0',
            hp: '1000',
            fallback: 'character-default',
        })
        await t.context.lua.trigger(conversationId, request)
        expect(t.context.store.conversation.get(conversationId)?.variables.initializations).toBe(
            '1',
        )
        expect(
            t.context.database.sqlite
                .query<{ count: number }, [string, string]>(
                    'SELECT count(*) as count FROM lua_event_runs WHERE conversation_id = ? AND event_key = ?',
                )
                .get(conversationId, key)?.count,
        ).toBe(1)
    })

    test('supports named triggers, button data, and one display batch per epoch', async () => {
        await t.context.lua.trigger(conversationId, {
            type: 'manual',
            name: 'toggleChoice',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
            triggerElementId: 'choice',
        })
        expect(t.context.store.conversation.get(conversationId)?.variables.choice).toBe('1')
        await t.context.lua.trigger(conversationId, {
            type: 'button',
            data: 'choice^Take the silver key',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
            triggerElementId: 'button',
        })
        expect(t.context.store.message.list(conversationId).at(-1)).toMatchObject({
            role: 'user',
            content: 'Take the silver key',
        })
        t.context.store.message.create(conversationId, 'assistant', 'Status', 'complete')
        const first = await t.context.generations.messagesWithDisplay(conversationId)
        const second = await t.context.generations.messagesWithDisplay(conversationId)
        expect(first.at(-1)?.displayContent).toContain('STATUS')
        expect(second).toEqual(first)
        expect(
            t.context.database.sqlite
                .query<{ count: number }, [string]>(
                    'SELECT count(*) as count FROM lua_display_batches WHERE conversation_id = ?',
                )
                .get(conversationId)?.count,
        ).toBe(1)
    })

    test('renders editDisplay only for the requested message page', async () => {
        for (let index = 0; index < 5; index++) {
            t.context.store.message.create(conversationId, 'assistant', 'Status', 'complete')
        }
        const countDisplayEvents = () =>
            t.context.database.sqlite
                .query<{ count: number }, [string]>(
                    "SELECT count(*) as count FROM lua_event_runs WHERE conversation_id = ? AND phase LIKE 'editDisplay:%'",
                )
                .get(conversationId)?.count

        const latest = await t.context.generations.messagePageWithDisplay(conversationId, {
            limit: 2,
        })
        expect(latest.messages).toHaveLength(2)
        expect(latest.messages.every((message) => message.displayContent?.includes('STATUS'))).toBe(
            true,
        )
        expect(countDisplayEvents()).toBe(2)

        await t.context.generations.messagePageWithDisplay(conversationId, { limit: 2 })
        expect(countDisplayEvents()).toBe(2)

        const older = await t.context.generations.messagePageWithDisplay(conversationId, {
            before: latest.nextCursor!,
            limit: 2,
        })
        expect(older.messages.map((message) => message.position)).toEqual([1, 2])
        expect(countDisplayEvents()).toBe(4)
    })

    test('round-trips a blocking alert only through the initiating tab', async () => {
        const clientInstanceId = crypto.randomUUID()
        const stream = t.context.events.subscribe(clientInstanceId)
        const reader = stream.getReader()
        await reader.read() // connection comment
        const invocation = t.context.lua.trigger(conversationId, {
            type: 'manual',
            name: 'setHP',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId,
            triggerElementId: 'hp',
        })
        const commandChunk = await reader.read()
        const commandText = new TextDecoder().decode(commandChunk.value)
        const command = JSON.parse(commandText.match(/data: (.+)\n\n/)![1]!) as {
            commandId: string
            kind: string
        }
        expect(command.kind).toBe('alertInput')
        expect(
            t.context.lua.remote.resolve(command.commandId, {
                clientInstanceId,
                result: '250',
            }),
        ).toBe('ok')
        // The success alert is fire-and-forget and does not block completion.
        await invocation
        expect(t.context.store.conversation.get(conversationId)?.variables.hp).toBe('250')
        await reader.cancel()
    })

    test('fails a blocking invocation when its initiating tab is unavailable', async () => {
        expect(
            t.context.lua.trigger(conversationId, {
                type: 'manual',
                name: 'setHP',
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: crypto.randomUUID(),
            }),
        ).rejects.toThrow(/initiating client/i)
    })

    test('commits pre-error callback changes but discards a timed-out invocation', async () => {
        const makeConversation = (code: string) => {
            const character = t.context.characters.create(
                CharacterCreateSchema.parse({
                    name: 'Lua policy fixture',
                    luaScript: { code, enabled: true, lowLevelAccess: false },
                }),
            )
            return t.context.conversations.create({
                characterId: character.id,
                greetingIndex: -1,
            }).id
        }
        const callbackConversation = makeConversation(`
            function partial(id)
                setChatVar(id, 'before_error', 'saved')
                error('expected callback failure')
            end
        `)
        const callback = await t.context.lua.trigger(callbackConversation, {
            type: 'manual',
            name: 'partial',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
        })
        expect(callback.warnings.join('\n')).toContain('expected callback failure')
        expect(t.context.store.conversation.get(callbackConversation)?.variables.before_error).toBe(
            'saved',
        )

        const timeoutConversation = makeConversation(`
            function spin(id)
                setChatVar(id, 'must_not_commit', '1')
                while true do end
            end
        `)
        expect(
            t.context.lua.trigger(timeoutConversation, {
                type: 'manual',
                name: 'spin',
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: crypto.randomUUID(),
            }),
        ).rejects.toThrow(/timeout/i)
        expect(
            t.context.store.conversation.get(timeoutConversation)?.variables.must_not_commit,
        ).toBeUndefined()
    })
})

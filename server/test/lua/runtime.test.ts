import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CharacterCreateSchema } from '@malang/shared'

import { type AppContext, createContext } from '@/services'

import { appConfig, fixturePath } from '../support/fixtures'

describe('PocketRisu Lua runtime', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-lua-'))
    const config = appConfig(directory)
    let context: AppContext
    let conversationId: string

    beforeAll(async () => {
        context = await createContext(config)
    })

    beforeEach(() => {
        const character = context.characters.create(
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
        conversationId = context.conversations.create({
            characterId: character.id,
            greetingIndex: -1,
        }).id
    })

    afterAll(() => {
        context.close()
        rmSync(directory, { recursive: true, force: true })
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
        await context.lua.trigger(conversationId, request)
        expect(context.store.conversation.get(conversationId)?.variables).toMatchObject({
            initialized: '1',
            choice: '0',
            hp: '1000',
            fallback: 'character-default',
        })
        await context.lua.trigger(conversationId, request)
        expect(context.store.conversation.get(conversationId)?.variables.initializations).toBe('1')
        expect(
            context.database.sqlite
                .query<{ count: number }, [string, string]>(
                    'SELECT count(*) as count FROM lua_event_runs WHERE conversation_id = ? AND event_key = ?',
                )
                .get(conversationId, key)?.count,
        ).toBe(1)
    })

    test('supports named triggers, button data, and one display batch per epoch', async () => {
        await context.lua.trigger(conversationId, {
            type: 'manual',
            name: 'toggleChoice',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
            triggerElementId: 'choice',
        })
        expect(context.store.conversation.get(conversationId)?.variables.choice).toBe('1')
        await context.lua.trigger(conversationId, {
            type: 'button',
            data: 'choice^Take the silver key',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
            triggerElementId: 'button',
        })
        expect(context.store.message.list(conversationId).at(-1)).toMatchObject({
            role: 'user',
            content: 'Take the silver key',
        })
        context.store.message.create(conversationId, 'assistant', 'Status', 'complete')
        const first = await context.generations.messagesWithDisplay(conversationId)
        const second = await context.generations.messagesWithDisplay(conversationId)
        expect(first.at(-1)?.displayContent).toContain('STATUS')
        expect(second).toEqual(first)
        expect(
            context.database.sqlite
                .query<{ count: number }, [string]>(
                    'SELECT count(*) as count FROM lua_display_batches WHERE conversation_id = ?',
                )
                .get(conversationId)?.count,
        ).toBe(1)
    })

    test('round-trips a blocking alert only through the initiating tab', async () => {
        const clientInstanceId = crypto.randomUUID()
        const stream = context.lua.remote.subscribe(clientInstanceId)
        const reader = stream.getReader()
        await reader.read() // connection comment
        const invocation = context.lua.trigger(conversationId, {
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
            context.lua.remote.resolve(command.commandId, {
                clientInstanceId,
                result: '250',
            }),
        ).toBe('ok')
        // The success alert is fire-and-forget and does not block completion.
        await invocation
        expect(context.store.conversation.get(conversationId)?.variables.hp).toBe('250')
        await reader.cancel()
    })

    test('fails a blocking invocation when its initiating tab is unavailable', async () => {
        expect(
            context.lua.trigger(conversationId, {
                type: 'manual',
                name: 'setHP',
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: crypto.randomUUID(),
            }),
        ).rejects.toThrow(/initiating client/i)
    })

    test('commits pre-error callback changes but discards a timed-out invocation', async () => {
        const makeConversation = (code: string) => {
            const character = context.characters.create(
                CharacterCreateSchema.parse({
                    name: 'Lua policy fixture',
                    luaScript: { code, enabled: true, lowLevelAccess: false },
                }),
            )
            return context.conversations.create({
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
        const callback = await context.lua.trigger(callbackConversation, {
            type: 'manual',
            name: 'partial',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
        })
        expect(callback.warnings.join('\n')).toContain('expected callback failure')
        expect(context.store.conversation.get(callbackConversation)?.variables.before_error).toBe(
            'saved',
        )

        const timeoutConversation = makeConversation(`
            function spin(id)
                setChatVar(id, 'must_not_commit', '1')
                while true do end
            end
        `)
        expect(
            context.lua.trigger(timeoutConversation, {
                type: 'manual',
                name: 'spin',
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: crypto.randomUUID(),
            }),
        ).rejects.toThrow(/timeout/i)
        expect(
            context.store.conversation.get(timeoutConversation)?.variables.must_not_commit,
        ).toBeUndefined()
    })
})

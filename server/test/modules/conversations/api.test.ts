import { afterAll, describe, expect, test } from 'bun:test'

import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'

import { createTestApp } from '../../helpers/app'

const t = await createTestApp()
afterAll(() => t.close())

describe('conversation messages', () => {
    test('deletes one message or the selected message and everything after it', async () => {
        const created = await t.send('/conversations', {
            method: 'POST',
            body: { characterId: GENERAL_CHAT_CHARACTER_ID, title: 'Message deletion scopes' },
        })
        expect(created.status).toBe(201)
        const id = ((await created.json()) as { id: string }).id
        const first = t.context.store.message.create(id, 'user', 'first', 'complete')
        const second = t.context.store.message.create(id, 'assistant', 'second', 'complete')
        const third = t.context.store.message.create(id, 'user', 'third', 'complete')
        const fourth = t.context.store.message.create(id, 'assistant', 'fourth', 'complete')

        const only = await t.send(`/conversations/${id}/messages/${second.id}`, {
            method: 'DELETE',
        })
        expect(only.status).toBe(204)
        expect(t.context.store.message.list(id).map((message) => message.id)).toEqual([
            first.id,
            third.id,
            fourth.id,
        ])

        const from = await t.send(`/conversations/${id}/messages/${third.id}/from`, {
            method: 'DELETE',
        })
        expect(from.status).toBe(200)
        expect(await from.json()).toEqual({ deleted: 2 })
        expect(t.context.store.message.list(id).map((message) => message.id)).toEqual([first.id])
    })

    test('paginates conversation messages from the newest page', async () => {
        const created = await t.send('/conversations', {
            method: 'POST',
            body: { characterId: GENERAL_CHAT_CHARACTER_ID, title: 'Message pagination' },
        })
        expect(created.status).toBe(201)
        const id = ((await created.json()) as { id: string }).id
        for (let index = 0; index < 7; index += 1) {
            t.context.store.message.create(
                id,
                index % 2 ? 'assistant' : 'user',
                `message-${index}`,
                'complete',
            )
        }

        const latestResponse = await t.send(`/conversations/${id}/messages?limit=3`)
        expect(latestResponse.status).toBe(200)
        const latest = (await latestResponse.json()) as {
            messages: Array<{ content: string; position: number }>
            hasMore: boolean
            nextCursor: number | null
        }
        expect(latest.messages.map((message) => message.content)).toEqual([
            'message-4',
            'message-5',
            'message-6',
        ])
        expect(latest.hasMore).toBe(true)
        expect(latest.nextCursor).toBe(4)

        const olderResponse = await t.send(
            `/conversations/${id}/messages?limit=3&before=${latest.nextCursor}`,
        )
        const older = (await olderResponse.json()) as typeof latest
        expect(older.messages.map((message) => message.content)).toEqual([
            'message-1',
            'message-2',
            'message-3',
        ])
        expect(older.hasMore).toBe(true)
        expect(older.nextCursor).toBe(1)

        const oldestResponse = await t.send(
            `/conversations/${id}/messages?limit=3&before=${older.nextCursor}`,
        )
        const oldest = (await oldestResponse.json()) as typeof latest
        expect(oldest.messages.map((message) => message.content)).toEqual(['message-0'])
        expect(oldest.hasMore).toBe(false)
        expect(oldest.nextCursor).toBeNull()
    })
})

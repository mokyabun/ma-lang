import { afterAll, describe, expect, test } from 'bun:test'

import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'

import { createTestApp } from '../../helpers/app'
import { createConversation, importCard, v3Card } from '../../helpers/fixtures'

const t = await createTestApp()
afterAll(() => t.close())

describe('characters', () => {
    test('provides a fixed general Chat character that cannot be changed or deleted', async () => {
        const listed = await t.send('/characters')
        expect(listed.status).toBe(200)
        expect(
            ((await listed.json()) as { characters: Array<{ id: string; name: string }> })
                .characters,
        ).toContainEqual(expect.objectContaining({ id: GENERAL_CHAT_CHARACTER_ID, name: 'Chat' }))

        const conversation = await t.send('/conversations', {
            method: 'POST',
            body: { characterId: GENERAL_CHAT_CHARACTER_ID },
        })
        expect(conversation.status).toBe(201)
        expect((await conversation.json()) as object).toMatchObject({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            title: 'Chat 1',
        })

        const secondConversation = await t.send('/conversations', {
            method: 'POST',
            body: { characterId: GENERAL_CHAT_CHARACTER_ID },
        })
        expect(secondConversation.status).toBe(201)
        expect((await secondConversation.json()) as object).toMatchObject({ title: 'Chat 2' })

        for (const [method, path, body] of [
            ['PATCH', `/characters/${GENERAL_CHAT_CHARACTER_ID}`, { name: 'Changed' }],
            ['DELETE', `/characters/${GENERAL_CHAT_CHARACTER_ID}`, undefined],
            ['DELETE', `/characters/${GENERAL_CHAT_CHARACTER_ID}/permanent`, undefined],
        ] as const) {
            const response = await t.send(path, {
                method,
                headers: { 'content-type': 'application/json' },
                body,
            })
            expect(response.status).toBe(409)
        }

        expect(t.context.store.character.get(GENERAL_CHAT_CHARACTER_ID)?.name).toBe('Chat')
    })

    test('persists character and chat groups, ordering, and safe group removal', async () => {
        const characterId = (await importCard(t)).id
        const conversationId = createConversation(t, { characterId }).id

        const characterGroupResponse = await t.send('/characters/groups', {
            method: 'POST',
            body: { name: 'Archive keepers' },
        })
        expect(characterGroupResponse.status).toBe(201)
        const characterGroup = (await characterGroupResponse.json()) as {
            id: string
            sortOrder: number
        }

        const organizedCharacters = await t.send('/characters/organization', {
            method: 'PUT',
            body: {
                groups: [{ id: characterGroup.id, sortOrder: 0 }],
                characters: [{ id: characterId, groupId: characterGroup.id, sortOrder: 0 }],
            },
        })
        expect(organizedCharacters.status).toBe(200)
        expect(t.context.store.character.get(characterId)).toMatchObject({
            groupId: characterGroup.id,
            sortOrder: 0,
        })

        const chatGroupResponse = await t.send('/conversations/groups', {
            method: 'POST',
            body: { characterId, name: 'Moon research' },
        })
        expect(chatGroupResponse.status).toBe(201)
        const chatGroup = (await chatGroupResponse.json()) as { id: string }

        const organizedChats = await t.send('/conversations/organization', {
            method: 'PUT',
            body: {
                characterId,
                groups: [{ id: chatGroup.id, sortOrder: 0 }],
                conversations: [{ id: conversationId, groupId: chatGroup.id, sortOrder: 0 }],
            },
        })
        expect(organizedChats.status).toBe(200)
        expect(t.context.store.conversation.get(conversationId)).toMatchObject({
            groupId: chatGroup.id,
            sortOrder: 0,
        })

        expect(
            (await t.send(`/conversations/groups/${chatGroup.id}`, { method: 'DELETE' })).status,
        ).toBe(204)
        expect(t.context.store.conversation.get(conversationId)?.groupId).toBeNull()

        expect(
            (await t.send(`/characters/groups/${characterGroup.id}`, { method: 'DELETE' })).status,
        ).toBe(204)
        expect(t.context.store.character.get(characterId)?.groupId).toBeNull()
    })

    test('edits the complete card workspace and conversation opening state', async () => {
        const current = await importCard(t)
        const characterId = current.id
        createConversation(t, { characterId, title: 'Library chat' })

        const loreEntry = current.lorebook![0]!
        const loreId = loreEntry.id
        const edited = await t.send(`/characters/${characterId}`, {
            method: 'PATCH',
            body: {
                description: 'An archivist who guards the lunar wing.',
                alternateGreetings: ['The archive remembered you.'],
                loreSettings: { scanDepth: 9, tokenBudget: 750, recursiveScanning: false },
                lorebook: [
                    {
                        ...loreEntry,
                        id: loreId,
                        content: 'The moon archive opens only after midnight.',
                    },
                ],
            },
        })
        expect(edited.status).toBe(200)
        expect((await edited.json()) as object).toMatchObject({
            description: 'An archivist who guards the lunar wing.',
            loreSettings: { scanDepth: 9, tokenBudget: 750, recursiveScanning: false },
        })

        const avatar = await t.send(`/characters/${characterId}/avatar`, {
            method: 'PUT',
            headers: { 'content-type': 'image/png', 'x-filename': 'avatar.png' },
            body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        })
        expect(avatar.status).toBe(200)
        const avatarBody = (await avatar.json()) as { avatarAssetId: string }
        expect(avatarBody.avatarAssetId).toBeTruthy()
        const assetResponse = await t.send(`/characters/${characterId}/assets`)
        expect((await assetResponse.json()) as object).toMatchObject({
            assets: [{ assetId: avatarBody.avatarAssetId, type: 'icon', name: 'main' }],
        })

        const alternateConversation = await t.send('/conversations', {
            method: 'POST',
            body: { characterId, greetingIndex: 0 },
        })
        expect(alternateConversation.status).toBe(201)
        const alternate = (await alternateConversation.json()) as {
            id: string
            title: string
            greetingIndex: number
        }
        expect(alternate.greetingIndex).toBe(0)
        expect(alternate.title).toBe('Chat 2')
        expect(t.context.store.message.list(alternate.id)[0]?.content).toBe(
            'The archive remembered you.',
        )

        const switchedGreeting = await t.send(`/conversations/${alternate.id}`, {
            method: 'PATCH',
            body: { greetingIndex: -1 },
        })
        expect(switchedGreeting.status).toBe(200)
        expect((await switchedGreeting.json()) as object).toMatchObject({ greetingIndex: -1 })
        expect(t.context.store.message.list(alternate.id)[0]?.content).toBe(current.firstMessage)

        const annotated = await t.send(`/conversations/${alternate.id}`, {
            method: 'PATCH',
            body: { authorNote: 'Keep this scene quiet.', variables: { trust: '2' } },
        })
        expect(annotated.status).toBe(200)
        expect((await annotated.json()) as object).toMatchObject({
            authorNote: 'Keep this scene quiet.',
            variables: { trust: '2' },
        })

        expect((await t.send(`/characters/${characterId}`, { method: 'DELETE' })).status).toBe(204)
        expect(
            (await t.send(`/characters/${characterId}/restore`, { method: 'POST' })).status,
        ).toBe(200)
    })

    test('permanently deletes conversations and characters with dependent history', async () => {
        const imported = await t.send('/characters/import', {
            method: 'POST',
            headers: { 'x-filename': 'delete-me.json' },
            body: v3Card({ name: 'Delete me' }),
        })
        const temporaryCharacterId = ((await imported.json()) as { character: { id: string } })
            .character.id
        const createCharacterConversation = () =>
            t.send('/conversations', {
                method: 'POST',
                body: { characterId: temporaryCharacterId },
            })

        const first = (await (await createCharacterConversation()).json()) as { id: string }
        t.context.store.message.create(
            first.id,
            'user',
            'This history will be deleted.',
            'complete',
        )
        expect(
            (await t.send(`/conversations/${first.id}/permanent`, { method: 'DELETE' })).status,
        ).toBe(204)
        expect(t.context.store.conversation.get(first.id)).toBeNull()
        expect(t.context.store.message.list(first.id)).toEqual([])

        const second = (await (await createCharacterConversation()).json()) as { id: string }
        expect(
            (await t.send(`/characters/${temporaryCharacterId}/permanent`, { method: 'DELETE' }))
                .status,
        ).toBe(204)
        expect(t.context.store.character.get(temporaryCharacterId)).toBeNull()
        expect(t.context.store.conversation.get(second.id)).toBeNull()
    })
})

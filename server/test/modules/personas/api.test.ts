import { afterAll, describe, expect, test } from 'bun:test'

import { createTestApp } from '../../helpers/app'
import { v3Card } from '../../helpers/fixtures'

const t = await createTestApp()
afterAll(() => t.close())

describe('personas', () => {
    test('follows the global persona unless a conversation locks its selection', async () => {
        const personaCard = v3Card({
            name: 'Persona Test Character',
            description: 'A neutral test character.',
        })
        const importedCharacter = await t.send('/characters/import', {
            method: 'POST',
            headers: { 'x-filename': 'persona-test.json' },
            body: personaCard,
        })
        expect(importedCharacter.status).toBe(201)
        const personaCharacterId = (
            (await importedCharacter.json()) as { character: { id: string } }
        ).character.id

        const personaConversation = await t.send('/conversations', {
            method: 'POST',
            body: { characterId: personaCharacterId, title: 'Persona thread' },
        })
        expect(personaConversation.status).toBe(201)
        const personaConversationId = ((await personaConversation.json()) as { id: string }).id

        async function createPersona(name: string, description: string) {
            const response = await t.send('/personas', {
                method: 'POST',
                body: { name, description },
            })
            expect(response.status).toBe(201)
            return (await response.json()) as { id: string; name: string }
        }

        async function preview() {
            const response = await t.send(
                `/conversations/${personaConversationId}/prompt-preview`,
                { method: 'POST' },
            )
            expect(response.status).toBe(200)
            return (await response.json()) as {
                messages: Array<{ content: string }>
                persona?: { id: string | null; name: string; source: string }
            }
        }

        const personaA = await createPersona('Aria', 'Aria is an archivist.')
        const personaB = await createPersona('Bram', 'Bram is a blacksmith.')

        // Validation protects both the global setting and stored conversation bindings.
        const invalidSettings = await t.send('/settings', {
            method: 'PATCH',
            body: { selectedPersonaId: crypto.randomUUID() },
        })
        expect(invalidSettings.status).toBe(422)
        const invalidBind = await t.send(`/conversations/${personaConversationId}`, {
            method: 'PATCH',
            body: { boundPersonaId: crypto.randomUUID() },
        })
        expect(invalidBind.status).toBe(404)

        // Global selection (A) is authoritative.
        const selectA = await t.send('/settings', {
            method: 'PATCH',
            body: { selectedPersonaId: personaA.id },
        })
        expect(selectA.status).toBe(200)
        const previewA = await preview()
        expect(previewA.persona).toMatchObject({ id: personaA.id, source: 'global' })
        expect(
            previewA.messages.some((message) => message.content.includes('archivist')),
        ).toBeTrue()

        // Merely storing a conversation value does not override the global selection.
        const bindB = await t.send(`/conversations/${personaConversationId}`, {
            method: 'PATCH',
            body: { boundPersonaId: personaB.id },
        })
        expect(bindB.status).toBe(200)
        const previewAfterLegacyBind = await preview()
        expect(previewAfterLegacyBind.persona).toMatchObject({ id: personaA.id, source: 'global' })
        expect(
            previewAfterLegacyBind.messages.some((message) =>
                message.content.includes('archivist'),
            ),
        ).toBeTrue()

        // Locking activates the conversation value and keeps it independent from global changes.
        const lockPersona = await t.send(`/conversations/${personaConversationId}`, {
            method: 'PATCH',
            body: { personaLocked: true },
        })
        expect(lockPersona.status).toBe(200)
        const previewLocked = await preview()
        expect(previewLocked.persona).toMatchObject({ id: personaB.id, source: 'conversation' })
        expect(
            previewLocked.messages.some((message) => message.content.includes('blacksmith')),
        ).toBeTrue()

        const unlockPersona = await t.send(`/conversations/${personaConversationId}`, {
            method: 'PATCH',
            body: { personaLocked: false },
        })
        expect(unlockPersona.status).toBe(200)
        const previewAfterUnlock = await preview()
        expect(previewAfterUnlock.persona).toMatchObject({ id: personaA.id, source: 'global' })

        // Switching the one global value updates this existing conversation immediately.
        const selectB = await t.send('/settings', {
            method: 'PATCH',
            body: { selectedPersonaId: personaB.id },
        })
        expect(selectB.status).toBe(200)
        const previewB = await preview()
        expect(previewB.persona).toMatchObject({ id: personaB.id, source: 'global' })
        expect(
            previewB.messages.some((message) => message.content.includes('blacksmith')),
        ).toBeTrue()

        const lockBeforeDelete = await t.send(`/conversations/${personaConversationId}`, {
            method: 'PATCH',
            body: { boundPersonaId: personaB.id, personaLocked: true },
        })
        expect(lockBeforeDelete.status).toBe(200)

        // Deleting a locked persona clears the reference and returns the conversation to global mode.
        const deleteB = await t.send(`/personas/${personaB.id}`, { method: 'DELETE' })
        expect(deleteB.status).toBe(204)
        const afterDelete = await t.send(`/conversations/${personaConversationId}`)
        expect(
            (await afterDelete.json()) as {
                boundPersonaId: string | null
                personaLocked: boolean
            },
        ).toMatchObject({ boundPersonaId: null, personaLocked: false })
        const previewAfterDelete = await preview()
        expect(previewAfterDelete.persona).toMatchObject({ id: null, source: 'default' })

        // Clearing the global selection uses the empty default identity.
        await t.send(`/personas/${personaA.id}`, { method: 'DELETE' })
        const clearSelection = await t.send('/settings', {
            method: 'PATCH',
            body: { selectedPersonaId: null },
        })
        expect(clearSelection.status).toBe(200)
        const previewDefault = await preview()
        expect(previewDefault.persona).toMatchObject({ id: null, source: 'default' })
        expect(
            previewDefault.messages.some((message) => message.content.includes('archivist')),
        ).toBeFalse()
    })

    test('avatar upload/removal and CRUD round-trip for personas', async () => {
        const created = await t.send('/personas', {
            method: 'POST',
            body: { name: 'Avatar Persona', description: 'Has an avatar.' },
        })
        expect(created.status).toBe(201)
        const persona = (await created.json()) as { id: string }

        const pngBytes = Uint8Array.from(
            atob(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            ),
            (char) => char.charCodeAt(0),
        )
        const form = new FormData()
        form.set('file', new Blob([pngBytes], { type: 'image/png' }), 'avatar.png')
        const avatarUpload = await t.send(`/personas/${persona.id}/avatar`, {
            method: 'PUT',
            body: form,
        })
        expect(avatarUpload.status).toBe(200)
        const withAvatar = (await avatarUpload.json()) as { avatarAssetId: string | null }
        expect(withAvatar.avatarAssetId).not.toBeNull()

        const assetResponse = await t.send(`/assets/${withAvatar.avatarAssetId}`)
        expect(assetResponse.status).toBe(200)
        expect(assetResponse.headers.get('content-type')).toBe('image/png')

        const avatarRemoved = await t.send(`/personas/${persona.id}/avatar`, { method: 'DELETE' })
        expect(avatarRemoved.status).toBe(200)
        expect(
            ((await avatarRemoved.json()) as { avatarAssetId: string | null }).avatarAssetId,
        ).toBeNull()

        const updated = await t.send(`/personas/${persona.id}`, {
            method: 'PATCH',
            body: { note: 'Updated note.' },
        })
        expect(updated.status).toBe(200)
        expect(((await updated.json()) as { note: string }).note).toBe('Updated note.')

        const deleted = await t.send(`/personas/${persona.id}`, { method: 'DELETE' })
        expect(deleted.status).toBe(204)

        const missing = await t.send(`/personas/${crypto.randomUUID()}`)
        expect(missing.status).toBe(404)
    })
})

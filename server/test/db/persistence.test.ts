import { afterAll, describe, expect, test } from 'bun:test'

import { createTestApp } from '../helpers/app'
import { createConversation, importCard } from '../helpers/fixtures'

const t = await createTestApp()
afterAll(() => t.close())

describe('SQLite persistence', () => {
    test('persists normalized data after reopening SQLite', async () => {
        const characterId = (await importCard(t)).id
        const conversationId = createConversation(t, { characterId, title: 'Library chat' }).id
        t.context.store.message.create(
            conversationId,
            'user',
            'Tell me about the moon.',
            'complete',
        )

        const recoverable = t.context.store.promptModule.create(
            {
                name: 'Recoverable module',
                description: '',
                namespace: 'test.recoverable',
                enabledByDefault: false,
                prompts: [],
                toggles: [],
                backgroundEmbedding: '<style>.risu-chat { color: silver; }</style>',
                lorebook: [],
            },
            {
                type: 'risuModule',
                module: {
                    customModuleToggle: '',
                    lorebook: [{ content: '{{getglobalvar::toggle_recovered_after_restart}}' }],
                },
            },
        )
        const recoveredModuleId = recoverable.id
        await t.reopen({ adminPassword: undefined })
        expect(t.context.store.character.get(characterId)?.name).toBe('Aria')
        expect(t.context.store.conversation.get(conversationId)?.title).toBe('Library chat')
        expect(t.context.store.message.list(conversationId)).toHaveLength(2)
        expect(t.context.store.promptModule.get(recoveredModuleId)?.toggles).toEqual([])
        expect(t.context.store.promptModule.get(recoveredModuleId)?.backgroundEmbedding).toContain(
            '.risu-chat',
        )
    })
})

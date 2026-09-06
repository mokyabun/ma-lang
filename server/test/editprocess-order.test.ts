import { describe, expect, test } from 'bun:test'

import { applyEditProcessToMessages } from '../src/services/app/generations/context'
import { compilePrompt } from '../src/services/prompt/compiler'

describe('PocketRisu editprocess ordering', () => {
    test('processes chat history before prompt blocks are assembled', async () => {
        const input = {
            character: {
                id: 'character',
                name: 'Helena',
                description: '',
                personality: '',
                scenario: '',
                firstMessage: '',
                exampleMessage: '',
                systemPrompt: '',
                postHistoryInstructions: '',
                lorebook: [],
                loreSettings: {},
                regexScripts: [],
            },
            conversation: { id: 'conversation', variables: {}, toggles: {}, authorNote: '' },
            messages: [
                {
                    id: 'message',
                    role: 'user',
                    content: 'history preamble\n# OOC\nhistory answer',
                    createdAt: '2024-01-01',
                },
            ],
            preset: {
                warnings: [],
                toggles: [
                    {
                        key: 'response_mode',
                        label: 'Response mode',
                        type: 'select',
                        options: [],
                        defaultValue: '3',
                    },
                ],
                defaultVariables: {},
                parameters: {},
                regexScripts: [],
                blocks: [
                    {
                        id: 'template',
                        enabled: true,
                        type: 'plain',
                        type2: 'normal',
                        role: 'user',
                        text: '{{#if {{? {{getglobalvar::toggle_response_mode}}>=2}}}}\n---\n\n## Response Template\n\n- Response must follow the template below:\n\n# OOC\n{{/if}}',
                    },
                    { id: 'chat', enabled: true, type: 'chat', rangeStart: 0, rangeEnd: 'end' },
                ],
                promptSettings: {
                    sendChatAsSystem: false,
                    sendName: false,
                    assistantPrefill: '',
                },
            },
            settings: {
                userName: 'Mina',
                globalVariables: {},
                promptToggleValues: { response_mode: '3' },
            },
            parameters: { maxContextTokens: 8192, maxOutputTokens: 512 },
            persona: {
                id: null,
                name: 'Mina',
                description: '',
                avatarAssetId: null,
                source: 'default',
            },
            modules: [
                {
                    id: 'module',
                    name: 'PocketRisu regex module',
                    namespace: 'compat',
                    toggles: [],
                    prompts: [],
                    lorebook: [],
                    warnings: [],
                    regexScripts: [
                        {
                            id: 'reasoning-request',
                            comment: '추론 리퀘스트',
                            pattern:
                                '^((?:[\\s\\S]*?(?:\\r\\n|\\n|\\r))?)[\\t ]{0,3}#[*\\t ]*(Response|응답|応答|响应|OOC)[*\\t ]*(?=\\r\\n|\\n|\\r|$)',
                            replacement: '# $2',
                            phase: 'editprocess',
                            enabled: true,
                            flags: '<order 4>i',
                        },
                    ],
                },
            ],
            assets: [],
            moduleActivationSources: { module: 'default' },
            modelId: 'gemini-test',
        } as unknown as Parameters<typeof compilePrompt>[0]

        const processed = await applyEditProcessToMessages(
            input.messages,
            input as unknown as Parameters<typeof applyEditProcessToMessages>[1],
        )
        const preview = compilePrompt({ ...input, messages: processed.messages })

        expect(processed.messages[0]?.content).toBe('# OOC\nhistory answer')
        expect(preview.messages).toContainEqual({
            role: 'user',
            content:
                '---\n\n## Response Template\n\n- Response must follow the template below:\n\n# OOC',
        })
    })
})

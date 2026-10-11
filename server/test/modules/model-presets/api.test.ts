import { afterAll, describe, expect, test } from 'bun:test'

import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'

import { createTestApp } from '../../helpers/app'

const t = await createTestApp()
afterAll(() => t.close())

describe('model presets, API keys, and conversation bindings', () => {
    test('imports, preserves, and exports PocketRisu model profile schema v1', async () => {
        const profile = {
            schemaVersion: 1,
            exportedAt: 1,
            profile: {
                id: 'vertex-gemini-native:gemini-test',
                displayName: 'Vertex Gemini Test',
                providerBaseId: 'vertex-gemini-native',
                modelId: 'gemini-test',
                endpoint: { kind: 'vertex-gemini' },
                auth: { kind: 'google-service-account', fields: ['serviceAccountJson'] },
                defaults: { serviceAccountJson: 'must-not-survive' },
                schema: [
                    {
                        key: 'serviceAccountJson',
                        type: 'string',
                        label: 'Service Account JSON',
                        secret: true,
                        default: 'must-not-survive',
                        mapsTo: { target: 'auth', path: 'apiKey' },
                    },
                    {
                        key: 'location',
                        type: 'string',
                        label: 'Location',
                        default: 'global',
                        mapsTo: { target: 'custom', path: 'location' },
                    },
                    {
                        key: 'modelId',
                        type: 'string',
                        label: 'Model ID',
                        default: 'gemini-test',
                        enum: [{ value: 'gemini-test', label: 'Gemini Test' }],
                        mapsTo: { target: 'body', path: 'model' },
                    },
                    {
                        key: 'maxOutputTokens',
                        type: 'integer',
                        label: 'Max Output Tokens',
                        default: 8192,
                        mapsTo: {
                            target: 'body',
                            path: 'generationConfig.maxOutputTokens',
                        },
                    },
                    {
                        key: 'thinkingLevel',
                        type: 'string',
                        label: 'Thinking Level',
                        default: 'medium',
                        enum: [{ value: 'medium', label: 'Medium' }],
                        mapsTo: {
                            target: 'body',
                            path: 'generationConfig.thinkingConfig.thinkingLevel',
                        },
                    },
                ],
                uiSchema: {
                    groups: [{ id: 'model', label: 'Model', order: 1 }],
                    fields: [
                        {
                            key: 'modelId',
                            widget: 'combobox',
                            visibility: 'basic',
                            group: 'model',
                            order: 1,
                        },
                    ],
                },
                capabilities: ['streaming', 'reasoning'],
                sourceUrls: [],
            },
            baseProvider: {
                id: 'vertex-gemini-native',
                displayName: 'Vertex Gemini Native',
                adapterKind: 'google-gemini',
                authKinds: ['google-service-account'],
                endpointKinds: ['vertex-gemini'],
                requestSchema: [],
                uiSchema: { groups: [], fields: [] },
                sourceUrls: [],
            },
        }
        const form = new FormData()
        form.set(
            'file',
            new File([JSON.stringify(profile)], 'Vertex_Gemini.profile.json', {
                type: 'application/json',
            }),
        )
        const response = await t.send('/model-presets/import', { method: 'POST', body: form })
        expect(response.status).toBe(201)
        const imported = (await response.json()) as {
            id: string
            name: string
            config: {
                provider: string
                modelId: string
                location: string
                defaults: { maxOutputTokens?: number }
                providerOptions: Record<string, unknown>
            }
        }
        expect(imported.name).toBe('Vertex Gemini Test')
        expect(imported.config.provider).toBe('vertex')
        expect(imported.config.modelId).toBe('gemini-test')
        expect(imported.config.location).toBe('global')
        expect(imported.config.defaults.maxOutputTokens).toBe(8192)
        expect(imported.config.providerOptions.thinkingLevel).toBe('medium')
        expect(JSON.stringify(imported)).not.toContain('must-not-survive')

        const exportedResponse = await t.send(`/model-presets/${imported.id}/export`)
        expect(exportedResponse.status).toBe(200)
        expect(exportedResponse.headers.get('content-disposition')).toContain('.profile.json')
        const exported = (await exportedResponse.json()) as typeof profile
        expect(exported.schemaVersion).toBe(1)
        expect(exported.profile.providerBaseId).toBe('vertex-gemini-native')
        expect(exported.profile.capabilities).toEqual(['streaming', 'reasoning'])
        expect(JSON.stringify(exported)).not.toContain('must-not-survive')
    })

    test('reuses an encrypted key and resolves primary and auxiliary chat models', async () => {
        const discovery = await t.send('/model-presets/models', {
            method: 'POST',
            body: {
                apiKeyId: null,
                config: {
                    provider: 'echo',
                    modelId: 'echo-model-hint',
                    defaults: {},
                    providerOptions: {},
                },
            },
        })
        expect(discovery.status).toBe(200)
        expect((await discovery.json()) as object).toEqual({
            models: [{ id: 'echo-model-hint', name: 'echo-model-hint' }],
        })

        const plaintext = 'sk-model-preset-secret-never-store-in-plaintext'
        const keyResponse = await t.send('/model-presets/api-keys', {
            method: 'POST',
            body: {
                name: 'OpenAI personal',
                provider: 'openai',
                credentialType: 'apiKey',
                apiKey: plaintext,
            },
        })
        expect(keyResponse.status).toBe(201)
        const key = (await keyResponse.json()) as { id: string; hint: string }
        expect(key.hint).toBe('••••text')

        const createPreset = (name: string, modelId: string) =>
            t.send('/model-presets', {
                method: 'POST',
                body: {
                    name,
                    apiKeyId: key.id,
                    config: {
                        provider: 'openai',
                        modelId,
                        defaults: { temperature: 0.7 },
                        providerOptions: {},
                    },
                },
            })
        const primaryResponse = await createPreset('Primary', 'gpt-primary')
        const auxiliaryResponse = await createPreset('Lua other', 'gpt-auxiliary')
        expect(primaryResponse.status).toBe(201)
        expect(auxiliaryResponse.status).toBe(201)
        const primary = (await primaryResponse.json()) as { id: string }
        const auxiliary = (await auxiliaryResponse.json()) as { id: string }

        const defaults = await t.send('/settings', {
            method: 'PATCH',
            body: {
                defaultModelPresetId: primary.id,
                defaultAuxiliaryModelPresetId: auxiliary.id,
            },
        })
        expect(defaults.status).toBe(200)

        const conversationResponse = await t.send('/conversations', {
            method: 'POST',
            body: { characterId: GENERAL_CHAT_CHARACTER_ID },
        })
        const conversation = (await conversationResponse.json()) as { id: string }
        const primaryRuntime = await t.context.providers.requireRuntimeForConversation(
            conversation.id,
        )
        const auxiliaryRuntime = await t.context.providers.requireRuntimeForConversation(
            conversation.id,
            true,
        )
        expect(primaryRuntime).toMatchObject({ modelId: 'gpt-primary', apiKey: plaintext })
        expect(auxiliaryRuntime).toMatchObject({ modelId: 'gpt-auxiliary', apiKey: plaintext })

        const rebound = await t.send(`/conversations/${conversation.id}`, {
            method: 'PATCH',
            body: {
                modelPresetId: auxiliary.id,
                auxiliaryModelPresetId: primary.id,
            },
        })
        expect(rebound.status).toBe(200)
        expect(
            await t.context.providers.requireRuntimeForConversation(conversation.id),
        ).toMatchObject({
            modelId: 'gpt-auxiliary',
        })
        expect(
            await t.context.providers.requireRuntimeForConversation(conversation.id, true),
        ).toMatchObject({ modelId: 'gpt-primary' })

        const encrypted = t.context.store.secretStorage.get().secrets.provider!
        expect(encrypted).toContain('AES-256-GCM')
        expect(encrypted).not.toContain(plaintext)
        expect((await t.send(`/model-presets/${primary.id}`, { method: 'DELETE' })).status).toBe(
            409,
        )
        expect(
            (await t.send(`/model-presets/api-keys/${key.id}`, { method: 'DELETE' })).status,
        ).toBe(409)
    })
})

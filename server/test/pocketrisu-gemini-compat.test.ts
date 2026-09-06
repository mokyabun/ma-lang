import { describe, expect, test } from 'bun:test'

import type { CompiledMessage } from '@malang/shared'

import { buildPocketRisuGeminiBody } from '../src/services/providers/gemini-rest'
import type { RuntimeProviderConfig } from '../src/services/providers/types'

/*
 * Independent compatibility oracle copied from PocketRisu's current pipeline:
 *
 * - preset/registry/snapshot.ts
 * - preset/adapter/buildRequest.ts
 * - process/index.svelte.ts (formatted message trim)
 * - preset/adapter/googleGemini.ts (collectSystemAndChat / wire invariants)
 *
 * Keep this deliberately separate from Malang's implementation. If production
 * behavior drifts, this test must fail instead of sharing the same helper.
 */
function pocketRisuReferenceBody(
    config: RuntimeProviderConfig,
    messages: CompiledMessage[],
): Record<string, unknown> {
    const binding = config.providerOptions?.__pocketRisuProfile as {
        envelope: {
            baseProvider: { defaultBody?: Record<string, unknown> }
            profile: {
                defaults: Record<string, unknown>
                bodyTemplate?: Record<string, unknown>
                schema: Array<{
                    key: string
                    default?: unknown
                    mapsTo?: { target: string; path: string }
                }>
            }
        }
        values: Record<string, unknown>
    }
    const body = structuredClone({
        ...binding.envelope.baseProvider.defaultBody,
        ...binding.envelope.profile.defaults,
        ...binding.envelope.profile.bodyTemplate,
    })

    for (const field of binding.envelope.profile.schema) {
        if (field.mapsTo?.target !== 'body') continue
        const value = Object.hasOwn(binding.values, field.key)
            ? binding.values[field.key]
            : field.default
        if (value === undefined || value === '') continue
        referenceSetNested(body, field.mapsTo.path, structuredClone(value))
    }
    Object.assign(body, structuredClone(referenceRecord(config.providerOptions?.customBody)))

    // Gemini adapter wire invariants.
    delete body.model
    delete body.contents
    delete body.systemInstruction

    const system: string[] = []
    const contents: Array<{
        role: 'user' | 'model'
        parts: Array<{ text: string }>
    }> = []
    for (const message of messages) {
        const content = message.content.trim()
        if (message.role === 'system') system.push(content)
        else {
            contents.push({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: content }],
            })
        }
    }
    body.contents = contents
    if (system.length) body.systemInstruction = { parts: [{ text: system.join('\n\n') }] }
    return body
}

function referenceSetNested(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.')
    let current = target
    for (const part of parts.slice(0, -1)) {
        const next = current[part]
        if (!next || typeof next !== 'object' || Array.isArray(next)) current[part] = {}
        current = current[part] as Record<string, unknown>
    }
    current[parts.at(-1)!] = value
}

function referenceRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
}

describe('PocketRisu Gemini wire compatibility oracle', () => {
    test('matches the independently copied Model Preset body algorithm', () => {
        const config = {
            provider: 'vertex',
            modelId: 'gemini-3.1-pro-preview',
            projectId: 'project',
            location: 'global',
            credentialType: 'serviceAccount',
            defaults: { maxOutputTokens: 12_000 },
            providerOptions: {
                __pocketRisuProfile: {
                    envelope: {
                        schemaVersion: 1,
                        baseProvider: {
                            id: 'vertex-gemini-native',
                            displayName: 'Vertex Gemini',
                            adapterKind: 'google-gemini',
                            authKinds: [],
                            endpointKinds: [],
                            requestSchema: [],
                            uiSchema: { groups: [], fields: [] },
                            sourceUrls: [],
                            defaultBody: { generationConfig: { responseMimeType: 'text/plain' } },
                        },
                        profile: {
                            id: 'vertex-gemini-native:pro',
                            displayName: 'Gemini Pro',
                            providerBaseId: 'vertex-gemini-native',
                            modelId: 'gemini-3.1-pro-preview',
                            endpoint: { kind: 'vertex-gemini' },
                            auth: { kind: 'google-service-account', fields: [] },
                            defaults: {},
                            bodyTemplate: { model: 'custom-body-must-not-win' },
                            schema: [
                                {
                                    key: 'modelId',
                                    type: 'string',
                                    label: 'Model',
                                    mapsTo: { target: 'body', path: 'model' },
                                },
                                {
                                    key: 'maxOutputTokens',
                                    type: 'integer',
                                    label: 'Max output',
                                    mapsTo: {
                                        target: 'body',
                                        path: 'generationConfig.maxOutputTokens',
                                    },
                                },
                                {
                                    key: 'thinkingLevel',
                                    type: 'string',
                                    label: 'Thinking',
                                    mapsTo: {
                                        target: 'body',
                                        path: 'generationConfig.thinkingConfig.thinkingLevel',
                                    },
                                },
                            ],
                            uiSchema: { groups: [], fields: [] },
                            capabilities: [],
                            sourceUrls: [],
                        },
                    },
                    values: {
                        modelId: 'gemini-3.1-pro-preview',
                        maxOutputTokens: 12_000,
                        thinkingLevel: 'high',
                    },
                },
            },
        } as unknown as RuntimeProviderConfig
        const messages: CompiledMessage[] = [
            { role: 'system', content: '\n# System\n' },
            {
                role: 'user',
                content:
                    '\n---\n\n## Response Template\n\n- Response must follow the template below:\n',
            },
            { role: 'system', content: '\n[Start a new chat]\n' },
            { role: 'assistant', content: '\n<Past conversations>\n' },
            { role: 'assistant', content: '\n</Past conversations>\n' },
        ]

        const expected = pocketRisuReferenceBody(config, messages)
        const actual = buildPocketRisuGeminiBody(config, messages, {
            temperature: 0.1,
            maxOutputTokens: 25_000,
        })

        expect(actual).toEqual(expected)
        expect(actual).toMatchObject({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: expect.stringContaining('## Response Template') }],
                },
                { role: 'model', parts: [{ text: '<Past conversations>' }] },
                { role: 'model', parts: [{ text: '</Past conversations>' }] },
            ],
            systemInstruction: { parts: [{ text: '# System\n\n[Start a new chat]' }] },
        })
    })
})

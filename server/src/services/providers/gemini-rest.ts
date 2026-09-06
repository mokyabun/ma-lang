import type { CompiledMessage, GenerationParameters } from '@malang/shared'

import { parseSse } from './http-stream'
import { pocketRisuProfileHeaders, readPocketRisuProfileBinding } from './pocketrisu-profile'
import { type ProviderChunk, ProviderError, type RuntimeProviderConfig } from './types'

type GeminiContent = { role: 'user' | 'model'; parts: Array<{ text: string }> }
type GeminiResponse = {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

/** PocketRisu's current Model Preset google-gemini adapter semantics. */
export function toPocketRisuGeminiPrompt(messages: CompiledMessage[]): {
    systemInstruction?: { parts: Array<{ text: string }> }
    contents: GeminiContent[]
} {
    const systems: string[] = []
    const contents: GeminiContent[] = []
    for (const message of messages) {
        // PocketRisu trims every formatted chat item immediately before the
        // Model Preset adapter receives it (process/index.svelte.ts).
        const content = message.content.trim()
        if (message.role === 'system') systems.push(content)
        else
            contents.push({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: content }],
            })
    }
    return {
        ...(systems.length
            ? { systemInstruction: { parts: [{ text: systems.join('\n\n') }] } }
            : {}),
        contents,
    }
}

export function buildPocketRisuGeminiBody(
    config: RuntimeProviderConfig,
    messages: CompiledMessage[],
    parameters: GenerationParameters,
): Record<string, unknown> {
    const binding = readPocketRisuProfileBinding(config.providerOptions)
    const body: Record<string, unknown> = binding
        ? structuredClone({
              ...record(binding.envelope.baseProvider.defaultBody),
              ...binding.envelope.profile.defaults,
              ...record(binding.envelope.profile.bodyTemplate),
          })
        : { generationConfig: compactGenerationConfig(config, parameters) }

    if (binding) {
        for (const field of binding.envelope.profile.schema) {
            if (field.mapsTo?.target !== 'body') continue
            const value = Object.hasOwn(binding.values, field.key)
                ? binding.values[field.key]
                : field.default
            if (value === undefined || value === '') continue
            setNested(body, field.mapsTo.path, value)
        }
    }

    // Same priority as PocketRisu's shared request builder: profile values,
    // then the preset's custom body, then its free-form additional parameters.
    Object.assign(body, record(config.providerOptions?.customBody))
    applyAdditionalParamsText(body, undefined, config.providerOptions?.additionalParamsText)

    // PocketRisu wire invariants: the model belongs in the URL and the adapter
    // exclusively owns prompt structure, overriding profile collisions.
    delete body.model
    delete body.contents
    delete body.systemInstruction
    Object.assign(body, toPocketRisuGeminiPrompt(messages))
    return body
}

export function pocketRisuGeminiHeaders(config: RuntimeProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...pocketRisuProfileHeaders(config.providerOptions),
    }
    const binding = readPocketRisuProfileBinding(config.providerOptions)
    if (binding) {
        for (const field of binding.envelope.profile.schema) {
            if (field.mapsTo?.target !== 'header') continue
            const value = Object.hasOwn(binding.values, field.key)
                ? binding.values[field.key]
                : field.default
            if (value !== undefined && value !== '') {
                const headerValue = scalarString(value)
                if (headerValue !== undefined) headers[field.mapsTo.path] = headerValue
            }
        }
    }
    Object.assign(headers, stringRecord(config.providerOptions?.customHeaders))
    applyAdditionalParamsText(undefined, headers, config.providerOptions?.additionalParamsText)
    return headers
}

export async function* streamGeminiRest(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    signal: AbortSignal,
    providerName: string,
): AsyncGenerator<ProviderChunk> {
    const response = await fetchGemini(
        url,
        {
            method: 'POST',
            headers: { ...headers, Accept: 'text/event-stream' },
            body: JSON.stringify(body),
            signal,
        },
        providerName,
    )
    if (!response.body)
        throw new ProviderError('invalid_provider_response', `${providerName} returned no stream`)

    for await (const event of parseSse(response.body as unknown as ReadableStream<Uint8Array>)) {
        if (!event.data || event.data === '[DONE]') continue
        let parsed: GeminiResponse
        try {
            parsed = JSON.parse(event.data) as GeminiResponse
        } catch {
            throw new ProviderError(
                'invalid_provider_response',
                `${providerName} returned malformed streaming JSON`,
            )
        }
        const delta = (parsed.candidates?.[0]?.content?.parts || [])
            .filter((part) => !part.thought)
            .map((part) => part.text || '')
            .join('')
        const usage = parsed.usageMetadata
            ? {
                  inputTokens: parsed.usageMetadata.promptTokenCount,
                  outputTokens: parsed.usageMetadata.candidatesTokenCount,
              }
            : undefined
        if (delta || usage) yield { delta, usage }
    }
}

export async function fetchGemini(
    url: string,
    init: RequestInit,
    providerName: string,
): Promise<Response> {
    let response: Response
    try {
        response = await fetch(url, init)
    } catch (error) {
        if (init.signal?.aborted) throw error
        throw new ProviderError(
            'provider_unreachable',
            error instanceof Error ? error.message : `${providerName} request failed`,
        )
    }
    if (response.ok) return response

    const detail = await response.text().catch(() => '')
    if (response.status === 401 || response.status === 403)
        throw new ProviderError('provider_auth', `${providerName} authentication failed`)
    if (response.status === 404)
        throw new ProviderError('model_not_found', `${providerName} model was not found`)
    if (response.status === 429)
        throw new ProviderError('rate_limited', `${providerName} quota exceeded`)
    if (/safety|blocked|blockReason/i.test(detail))
        throw new ProviderError('safety_blocked', `${providerName} blocked the response`)
    throw new ProviderError(
        'provider_unreachable',
        `${providerName} returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`,
    )
}

function compactGenerationConfig(
    config: RuntimeProviderConfig,
    parameters: GenerationParameters,
): Record<string, unknown> {
    const options = config.providerOptions ?? {}
    return Object.fromEntries(
        Object.entries({
            temperature: parameters.temperature,
            topP: parameters.topP,
            topK: parameters.topK,
            frequencyPenalty: parameters.frequencyPenalty,
            presencePenalty: parameters.presencePenalty,
            maxOutputTokens: parameters.maxOutputTokens,
            stopSequences: parameters.stopSequences,
            seed: options.seed,
            responseMimeType: options.responseMimeType,
            thinkingConfig:
                options.thinkingLevel !== undefined || options.includeThoughts !== undefined
                    ? {
                          ...(typeof options.thinkingLevel === 'string'
                              ? { thinkingLevel: options.thinkingLevel }
                              : {}),
                          ...(typeof options.includeThoughts === 'boolean'
                              ? { includeThoughts: options.includeThoughts }
                              : {}),
                      }
                    : undefined,
        }).filter(([, value]) => value !== undefined),
    )
}

function setNested(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.').filter(Boolean)
    if (!parts.length) return
    let current = target
    for (const part of parts.slice(0, -1)) {
        if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part]))
            current[part] = {}
        current = current[part] as Record<string, unknown>
    }
    current[parts.at(-1)!] = structuredClone(value)
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
}

function scalarString(value: unknown): string | undefined {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return `${value}`
    return undefined
}

function stringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) => {
            const text = scalarString(item)
            return text === undefined ? [] : [[key, text]]
        }),
    )
}

function applyAdditionalParamsText(
    body: Record<string, unknown> | undefined,
    headers: Record<string, string> | undefined,
    value: unknown,
): void {
    if (typeof value !== 'string') return
    for (const raw of value.split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const separator = line.indexOf('=')
        if (separator <= 0) continue
        const key = line.slice(0, separator).trim()
        const rawValue = line.slice(separator + 1)
        const header = key.startsWith('header::') ? key.slice(8) : undefined
        if (rawValue === '{{none}}') {
            if (header) delete headers?.[header]
            else if (body) delete body[key]
            continue
        }
        if (header) {
            if (headers) headers[header] = rawValue
            continue
        }
        if (!body) continue
        if (rawValue.startsWith('json::')) {
            try {
                setNested(body, key, JSON.parse(rawValue.slice(6)))
            } catch {
                // PocketRisu ignores malformed free-form JSON entries.
            }
            continue
        }
        if (
            (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
            (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ) {
            setNested(body, key, rawValue.slice(1, -1))
            continue
        }
        if (rawValue === 'true' || rawValue === 'false') {
            setNested(body, key, rawValue === 'true')
            continue
        }
        if (rawValue === 'null') {
            setNested(body, key, null)
            continue
        }
        const numberValue = Number(rawValue)
        setNested(body, key, Number.isNaN(numberValue) ? rawValue : numberValue)
    }
}

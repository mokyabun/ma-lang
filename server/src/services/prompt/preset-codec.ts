import {
    type GenerationParameters,
    type PromptBlock,
    PromptBlockSchema,
    type PromptPresetInput,
} from '@malang/shared'
import { compressSync, decompressSync } from 'fflate'
import { pack, unpack } from 'msgpackr'

import { ValidationError } from '@/errors/app-error'

import {
    normalizePromptSettings,
    normalizeRegexScripts,
    parseModuleIntegrations,
    parsePromptToggles,
    record,
    serializePromptToggles,
    toRisuRegexScripts,
} from './risu'
import { decodeRPack, encodeRPack } from './rpack'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const secretFields = new Set([
    'openAIKey',
    'proxyKey',
    'forceReplaceUrl',
    'forceReplaceUrl2',
    'textgenWebUIStreamURL',
    'textgenWebUIBlockingURL',
    'vertexPrivateKey',
    'vertexClientEmail',
    'ollamaApiKey',
])

export class PresetFormatError extends ValidationError {
    constructor(message: string) {
        super(message)
        this.name = 'PresetFormatError'
    }
}

function normalizeRole(value: unknown): 'user' | 'bot' | 'system' {
    if (value === 'user' || value === 'system' || value === 'bot') return value
    if (value === 'assistant' || value === 'char') return 'bot'
    return 'system'
}

function normalizeBlocks(value: unknown, warnings: string[]): PromptBlock[] {
    if (!Array.isArray(value)) return []
    return value.map((raw, index) => {
        const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
        const type = typeof source.type === 'string' ? source.type : 'unknown'
        const base = {
            ...source,
            id: typeof source.id === 'string' ? source.id : crypto.randomUUID(),
            enabled: source.enabled !== false,
        }
        if (type === 'plain' || type === 'jailbreak' || type === 'cot') {
            return PromptBlockSchema.parse({
                ...base,
                type,
                type2: ['normal', 'globalNote', 'main'].includes(String(source.type2))
                    ? source.type2
                    : 'normal',
                text: typeof source.text === 'string' ? source.text : '',
                role: normalizeRole(source.role),
            })
        }
        if (['persona', 'description', 'lorebook', 'postEverything'].includes(type)) {
            return PromptBlockSchema.parse({
                ...base,
                type,
                role2: source.role2 ? normalizeRole(source.role2) : undefined,
            })
        }
        if (type === 'authornote') {
            return PromptBlockSchema.parse({
                ...base,
                type,
                role2: source.role2 ? normalizeRole(source.role2) : undefined,
            })
        }
        if (type === 'chat') {
            return PromptBlockSchema.parse({
                ...base,
                type,
                rangeStart: Number.isInteger(source.rangeStart) ? source.rangeStart : 0,
                rangeEnd:
                    source.rangeEnd === 'end' || Number.isInteger(source.rangeEnd)
                        ? source.rangeEnd
                        : 'end',
            })
        }
        if (type === 'chatML') {
            return PromptBlockSchema.parse({
                ...base,
                type,
                text: typeof source.text === 'string' ? source.text : '',
            })
        }
        warnings.push(`Prompt block ${index + 1} (${type}) is preserved but disabled`)
        return PromptBlockSchema.parse({
            id: base.id,
            enabled: false,
            name: typeof source.name === 'string' ? source.name : undefined,
            type,
            raw: source,
        })
    })
}

function normalizedParameters(source: Record<string, unknown>): GenerationParameters {
    // RisuAI's -1000 means "provider default"; never send it to providers.
    const numeric = (key: string, divisor = 1) => {
        const value = source[key]
        if (typeof value !== 'number' || !Number.isFinite(value) || value === -1000) {
            return undefined
        }
        return value / divisor
    }
    return {
        temperature: numeric('temperature', 100),
        topP: numeric('top_p'),
        topK: numeric('top_k'),
        minP: numeric('min_p'),
        topA: numeric('top_a'),
        repetitionPenalty: numeric('repetition_penalty'),
        frequencyPenalty: numeric('frequency_penalty', 100),
        presencePenalty: numeric('presence_penalty', 100),
        maxContextTokens: numeric('maxContext'),
        maxOutputTokens: numeric('maxResponse'),
        stopSequences: Array.isArray(source.localStopStrings)
            ? source.localStopStrings.filter((value): value is string => typeof value === 'string')
            : undefined,
    }
}

function sanitizeSource(source: Record<string, unknown>): Record<string, unknown> {
    const result = structuredClone(source)
    for (const key of secretFields) delete result[key]
    delete result.aiModel
    delete result.subModel
    return result
}

async function risuKey(): Promise<CryptoKey> {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode('risupreset'))
    return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function decryptPreset(value: Uint8Array): Promise<Uint8Array> {
    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(12) },
            await risuKey(),
            value,
        )
        return new Uint8Array(decrypted)
    } catch {
        throw new PresetFormatError('Invalid encrypted .risupreset payload')
    }
}

async function encryptPreset(value: Uint8Array): Promise<Uint8Array> {
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: new Uint8Array(12) },
        await risuKey(),
        value,
    )
    return new Uint8Array(encrypted)
}

export async function importPromptPreset(
    bytes: Uint8Array,
    filename: string,
): Promise<{
    input: PromptPresetInput
    source: Record<string, unknown>
    warnings: string[]
}> {
    let source: Record<string, unknown>
    const lowercaseFilename = filename.toLocaleLowerCase()
    if (lowercaseFilename.endsWith('.risupreset') || lowercaseFilename.endsWith('.risup')) {
        try {
            const packed = lowercaseFilename.endsWith('.risup') ? decodeRPack(bytes) : bytes
            const envelope = unpack(decompressSync(packed)) as Record<string, unknown>
            if (
                envelope.type !== 'preset' ||
                (envelope.presetVersion !== 0 && envelope.presetVersion !== 2) ||
                !(envelope.preset instanceof Uint8Array || envelope.pres instanceof Uint8Array)
            ) {
                throw new PresetFormatError('Unsupported Risu preset envelope')
            }
            const encrypted = (envelope.preset || envelope.pres) as Uint8Array
            source = unpack(await decryptPreset(encrypted)) as Record<string, unknown>
        } catch (error) {
            if (error instanceof PresetFormatError) throw error
            throw new PresetFormatError('Invalid Risu preset file')
        }
    } else {
        try {
            source = JSON.parse(decoder.decode(bytes)) as Record<string, unknown>
        } catch {
            throw new PresetFormatError('Invalid preset JSON')
        }
    }
    const warnings: string[] = []
    const sanitized = sanitizeSource(source)
    return {
        input: {
            name: typeof source.name === 'string' && source.name ? source.name : 'Imported',
            blocks: normalizeBlocks(source.promptTemplate, warnings),
            parameters: normalizedParameters(source),
            defaultVariables: parseKeyValue(
                typeof source.templateDefaultVariables === 'string'
                    ? source.templateDefaultVariables
                    : '',
            ),
            toggles: parsePromptToggles(source.customPromptTemplateToggle),
            regexScripts: normalizeRegexScripts(source.regex),
            moduleIntegrations: parseModuleIntegrations(source.moduleIntergration),
            // RisuAI stores groupTemplate at the preset's top level.
            promptSettings: normalizePromptSettings({
                ...record(source.promptSettings),
                groupTemplate: source.groupTemplate,
            }),
        },
        source: sanitized,
        warnings,
    }
}

export async function exportPromptPreset(
    input: PromptPresetInput,
    format: 'json' | 'risupreset' | 'risup',
): Promise<Uint8Array> {
    const source = {
        name: input.name,
        promptTemplate: input.blocks.map((block) => ('raw' in block ? block.raw : block)),
        temperature:
            input.parameters.temperature === undefined ? -1000 : input.parameters.temperature * 100,
        top_p: input.parameters.topP ?? -1000,
        top_k: input.parameters.topK ?? -1000,
        min_p: input.parameters.minP ?? -1000,
        top_a: input.parameters.topA ?? -1000,
        repetition_penalty: input.parameters.repetitionPenalty ?? -1000,
        frequency_penalty:
            input.parameters.frequencyPenalty === undefined
                ? -1000
                : input.parameters.frequencyPenalty * 100,
        presence_penalty:
            input.parameters.presencePenalty === undefined
                ? -1000
                : input.parameters.presencePenalty * 100,
        maxContext: input.parameters.maxContextTokens ?? 8192,
        maxResponse: input.parameters.maxOutputTokens ?? 512,
        localStopStrings: input.parameters.stopSequences || [],
        templateDefaultVariables: Object.entries(input.defaultVariables)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n'),
        customPromptTemplateToggle: serializePromptToggles(input.toggles || []),
        regex: toRisuRegexScripts(input.regexScripts || []),
        moduleIntergration: (input.moduleIntegrations || []).join(', '),
        promptSettings: input.promptSettings,
        // RisuAI stores this at the top level of the preset, not nested in promptSettings.
        groupTemplate: input.promptSettings?.groupTemplate,
        openAIKey: '',
        proxyKey: '',
        forceReplaceUrl: '',
        forceReplaceUrl2: '',
    }
    if (format === 'json') return encoder.encode(JSON.stringify(source, null, 2))
    const encrypted = await encryptPreset(pack(source))
    const packed = compressSync(pack({ presetVersion: 2, type: 'preset', preset: encrypted }))
    return format === 'risup' ? encodeRPack(packed) : packed
}

function parseKeyValue(value: string): Record<string, string> {
    const result: Record<string, string> = {}
    for (const line of value.split(/\r?\n/)) {
        const index = line.indexOf('=')
        if (index <= 0) continue
        result[line.slice(0, index).trim()] = line.slice(index + 1)
    }
    return result
}

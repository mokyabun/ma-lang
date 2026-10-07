import type { BiasEntry } from '@malang/shared'

import { readPocketRisuProfileBinding } from './pocketrisu-profile'
import type { RuntimeProviderConfig } from './types'

export interface GenerationBias {
    entries: BiasEntry[]
    /** The model's tokenizer, as PocketRisu's tokenizeNum. */
    encode: (text: string) => ArrayLike<number>
}

const STRONG_BAN = -101
const strongBanPunctuation = ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~“”‘’«»「」…–―※'

/**
 * Whether PocketRisu's classic requestOpenAI path keeps `logit_bias` for this model. Model presets
 * (profiles) and the Mistral branch never send it, and image-input models drop it unless GPT.
 */
export function sendsOpenAILogitBias(config: RuntimeProviderConfig): boolean {
    if (readPocketRisuProfileBinding(config.providerOptions)) return false
    switch (config.provider) {
        case 'mistral':
        case 'openrouter':
        case 'nanogpt':
            return false
        case 'openai':
            // PocketRisu flags every o-series model as image input.
            return !/^o\d/.test(config.modelId)
        default:
            return true
    }
}

/** requestOpenAI: `[[id]]` biases a token ID directly and -101 strong-bans the string. */
export function openAILogitBias(bias: GenerationBias): Record<number, number> {
    const logitBias: Record<number, number> = {}
    for (const [text, value] of bias.entries) {
        if (text.startsWith('[[') && text.endsWith(']]')) {
            // No radix, as PocketRisu: `[[0x1F]]` reads as hex.
            const token = parseInt(text.replace('[[', '').replace(']]', ''))
            if (!Number.isNaN(token)) logitBias[token] = value
            continue
        }
        if (value === STRONG_BAN) {
            strongBan(text, bias.encode, logitBias)
            continue
        }
        for (const token of Array.from(bias.encode(text))) logitBias[token] = value
    }
    return logitBias
}

/** Bans the first token of the string's case variants glued to punctuation on either side. */
function strongBan(
    text: string,
    encode: GenerationBias['encode'],
    logitBias: Record<number, number>,
) {
    // PocketRisu throws on an empty string here (`data[0]`), failing the whole request.
    if (!text) return
    const variants = [
        text,
        text.trim(),
        text.toLocaleUpperCase(),
        text.toLocaleLowerCase(),
        text[0]!.toLocaleUpperCase() + text.slice(1),
        text[0]!.toLocaleLowerCase() + text.slice(1),
    ]
    const punctuationTokens = new Set(Array.from(strongBanPunctuation, (char) => encode(char)[0]))
    const ban = (token: number | undefined) => {
        if (token !== undefined && !punctuationTokens.has(token)) logitBias[token] = -100
    }
    for (const char of strongBanPunctuation) {
        for (const variant of variants) {
            ban(encode(variant + char)[0])
            ban(encode(char + variant)[0])
        }
    }
}

export function novelAILogitBiasExp(bias: GenerationBias) {
    return bias.entries.map(([text, value]) => ({
        sequence: Array.from(bias.encode(text)),
        bias: value,
        ensure_sequence_finish: false,
        generate_once: true,
    }))
}

/** NovelList takes the raw strings, not token IDs. */
export function novelListLogitBias(entries: BiasEntry[]) {
    if (!entries.length) return {}
    return {
        logit_bias: entries.map(([text]) => text).join('<<|>>'),
        logit_bias_values: entries.map(([, value]) => value.toString()).join('|'),
    }
}

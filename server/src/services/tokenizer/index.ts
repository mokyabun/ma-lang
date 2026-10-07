import { type ProviderKind, type TokenizerId, TokenizerIdSchema } from '@malang/shared'

import { readPocketRisuProfileBinding } from '@/services/providers/pocketrisu-profile'

import { type EncoderName, loadEncoder, type TokenEncoder } from './encoders'

export interface TokenizerConfig {
    provider: ProviderKind
    modelId: string
    tokenizer?: TokenizerId
    providerOptions?: Record<string, unknown>
}

const encoderFor: Record<TokenizerId, EncoderName> = {
    // Risu's custom-tokenizer path (OpenRouter, reverse proxy) sends `tik` to its o200k default.
    tik: 'o200k_base',
    cl100k_base: 'cl100k_base',
    o200k_base: 'o200k_base',
    mistral: 'mistral',
    novelai: 'novelai',
    claude: 'claude',
    llama: 'llama',
    llama3: 'llama3',
    novellist: 'novellist',
    // Risu builds its Gemma tokenizer from llama/llama3.json; the two encode identically.
    gemma: 'llama3',
    cohere: 'cohere',
    deepseek: 'deepseek',
    'deepseek-v4': 'deepseek-v4',
    glm4: 'glm4',
    glm5: 'glm5',
}

/** The model preset's override, then its PocketRisu profile's recommendation, then the model's own. */
export function resolveTokenizerId(config: TokenizerConfig | null | undefined): TokenizerId {
    if (!config) return 'cl100k_base'
    if (config.tokenizer) return config.tokenizer
    const recommended = TokenizerIdSchema.safeParse(
        readPocketRisuProfileBinding(config.providerOptions)?.envelope.profile.recommendedTokenizer,
    )
    if (recommended.success) return recommended.data
    return modelTokenizer(config.provider, config.modelId)
}

/** Risu's model list tokenizers; models it does not list fall back to cl100k. */
function modelTokenizer(provider: ProviderKind, modelId: string): TokenizerId {
    switch (provider) {
        case 'openai':
            return /^(gpt-3\.5|gpt-4(-|$)|instructgpt)/.test(modelId) ? 'cl100k_base' : 'o200k_base'
        case 'anthropic':
            return 'claude'
        case 'aws':
            return modelId.includes('claude') ? 'claude' : 'cl100k_base'
        case 'google':
        case 'vertex':
            return 'gemma'
        case 'mistral':
            return 'mistral'
        case 'cohere':
            return 'cohere'
        case 'novelai':
            return 'novelai'
        case 'novellist':
            return 'novellist'
        case 'deepseek':
            return modelId.startsWith('deepseek-v4') ? 'deepseek-v4' : 'deepseek'
        case 'deepinfra':
            return 'deepseek'
        case 'ooba':
        case 'mancer':
            return 'llama'
        case 'openrouter':
        case 'openai-compatible':
            return 'o200k_base'
        default:
            return 'cl100k_base'
    }
}

/** Port of Risu's ChatTokenizer: per-message overhead plus the speaker name when counted. */
export class ChatTokenizer {
    constructor(
        private readonly encoder: TokenEncoder,
        private readonly chatAdditionalTokens: number,
        private readonly countNames: boolean,
    ) {}

    count(text: string): number {
        return this.encoder.encode(text).length
    }

    tokenizeChat(chat: { content: string; name?: string }): number {
        let tokens = this.count(chat.content) + this.chatAdditionalTokens
        if (chat.name && this.countNames) tokens += this.count(chat.name) + 1
        return tokens
    }
}

export async function chatTokenizerFor(
    config: TokenizerConfig | null | undefined,
): Promise<ChatTokenizer> {
    // Risu keys these on `aiModel.startsWith('gpt')`, which only its OpenAI models match.
    const gpt = config?.provider === 'openai' && config.modelId.startsWith('gpt')
    const encoder = await loadEncoder(encoderFor[resolveTokenizerId(config)])
    return new ChatTokenizer(encoder, gpt ? 5 : 3, !gpt)
}

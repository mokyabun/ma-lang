import { AnthropicAdapter } from './anthropic'
import { AwsBedrockAdapter } from './aws'
import { CohereAdapter } from './cohere'
import { GoogleAIStudioAdapter } from './google'
import { LegacyPocketAdapter } from './legacy'
import { OllamaAdapter } from './ollama'
import { OpenAICompatibleAdapter } from './openai-compatible'
import type { ProviderAdapter, RuntimeProviderConfig } from './types'
import { VertexAdapter } from './vertex'

export * from './anthropic'
export * from './aws'
export * from './bias'
export * from './cohere'
export * from './google'
export * from './legacy'
export * from './ollama'
export * from './openai-compatible'
export * from './pocketrisu-profile'
export * from './types'
export * from './vertex'

const openAI = new OpenAICompatibleAdapter()
const anthropic = new AnthropicAdapter()
const google = new GoogleAIStudioAdapter()
const vertex = new VertexAdapter()
const cohere = new CohereAdapter()
const aws = new AwsBedrockAdapter()
const ollama = new OllamaAdapter()
const legacy = new LegacyPocketAdapter()

export function providerFor(config: RuntimeProviderConfig): ProviderAdapter {
    if (
        config.apiFormat === 'openai-chat' ||
        config.apiFormat === 'openai-completions' ||
        config.apiFormat === 'openai-responses'
    ) {
        return openAI
    }
    if (config.apiFormat === 'anthropic-messages') return anthropic
    if (config.apiFormat === 'google-gemini') return google
    switch (config.provider) {
        case 'openai':
        case 'openrouter':
        case 'mistral':
        case 'deepseek':
        case 'deepinfra':
        case 'nanogpt':
        case 'openai-compatible':
        case 'ooba':
            return openAI
        case 'anthropic':
            return anthropic
        case 'google':
            return google
        case 'vertex':
            return vertex
        case 'cohere':
            return cohere
        case 'aws':
            return aws
        case 'ollama':
            return ollama
        case 'novelai':
        case 'novellist':
        case 'horde':
        case 'mancer':
        case 'kobold':
        case 'echo':
        case 'webllm':
        case 'plugin':
            return legacy
    }
}

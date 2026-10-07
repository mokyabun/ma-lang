import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'

export const GenerationParametersSchema = z.object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(0).optional(),
    minP: z.number().min(0).max(1).optional(),
    topA: z.number().min(0).max(1).optional(),
    repetitionPenalty: z.number().min(0).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
    maxContextTokens: z.number().int().min(256).max(10_000_000).optional(),
    maxOutputTokens: z.number().int().min(1).max(1_000_000).optional(),
    stopSequences: z.array(z.string().max(500)).max(32).optional(),
})

export const ProviderKindSchema = z.enum([
    'openai',
    'openrouter',
    'anthropic',
    'google',
    'vertex',
    'mistral',
    'cohere',
    'novelai',
    'novellist',
    'horde',
    'aws',
    'deepseek',
    'deepinfra',
    'nanogpt',
    'openai-compatible',
    'ooba',
    'mancer',
    'kobold',
    'ollama',
    'echo',
    'webllm',
    'plugin',
])

export const ProviderApiFormatSchema = z.enum([
    'openai-chat',
    'openai-completions',
    'openai-responses',
    'anthropic-messages',
    'google-gemini',
    'cohere-chat',
    'novelai',
    'novellist',
    'horde',
    'kobold',
    'ollama',
    'aws-bedrock',
    'echo',
])

// RisuAI's tokenizer names; `cl100k_base`/`o200k_base` are its plugin-provider names for tiktoken.
export const TokenizerIdSchema = z.enum([
    'tik',
    'cl100k_base',
    'o200k_base',
    'mistral',
    'novelai',
    'claude',
    'llama',
    'llama3',
    'novellist',
    'gemma',
    'cohere',
    'deepseek',
    'deepseek-v4',
    'glm4',
    'glm5',
])

const ProviderBaseSchema = z.object({
    modelId: z.string().min(1).max(512),
    auxiliaryModelId: z.string().max(512).optional(),
    defaults: GenerationParametersSchema.default({}),
    baseUrl: z
        .url()
        .refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), {
            message: 'Provider URL must use http or https',
        })
        .optional(),
    apiFormat: ProviderApiFormatSchema.optional(),
    providerOptions: z.record(z.string(), z.unknown()).default({}),
    credentialType: z.enum(['none', 'adc', 'apiKey', 'serviceAccount', 'aws']).optional(),
    tokenizer: TokenizerIdSchema.optional(),
})

function keyedProvider<
    const T extends Exclude<z.infer<typeof ProviderKindSchema>, 'vertex' | 'aws'>,
>(provider: T) {
    return ProviderBaseSchema.extend({ provider: z.literal(provider) })
}

export const VertexProviderConfigSchema = ProviderBaseSchema.extend({
    provider: z.literal('vertex'),
    projectId: z.string().max(256).default(''),
    location: z.string().min(1).max(100).default('global'),
})

export const AwsProviderConfigSchema = ProviderBaseSchema.extend({
    provider: z.literal('aws'),
    region: z.string().min(1).max(100).default('us-east-1'),
    accessKeyId: z.string().max(512).optional(),
})

export const OllamaProviderConfigSchema = keyedProvider('ollama').extend({
    baseUrl: z.url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), {
        message: 'Ollama URL must use http or https',
    }),
})

export const ProviderConfigSchema = z.discriminatedUnion('provider', [
    keyedProvider('openai'),
    keyedProvider('openrouter'),
    keyedProvider('anthropic'),
    keyedProvider('google'),
    VertexProviderConfigSchema,
    keyedProvider('mistral'),
    keyedProvider('cohere'),
    keyedProvider('novelai'),
    keyedProvider('novellist'),
    keyedProvider('horde'),
    AwsProviderConfigSchema,
    keyedProvider('deepseek'),
    keyedProvider('deepinfra'),
    keyedProvider('nanogpt'),
    keyedProvider('openai-compatible'),
    keyedProvider('ooba'),
    keyedProvider('mancer'),
    keyedProvider('kobold'),
    OllamaProviderConfigSchema,
    keyedProvider('echo'),
    keyedProvider('webllm'),
    keyedProvider('plugin'),
])

const ProviderSecretInputSchema = z.object({
    apiKey: z.string().min(1).max(100_000).optional(),
    serviceAccountJson: z.string().min(1).max(100_000).optional(),
    awsSecretAccessKey: z.string().min(1).max(10_000).optional(),
    awsSessionToken: z.string().min(1).max(100_000).optional(),
    clearApiKey: z.boolean().default(false),
    clearCredentials: z.boolean().default(false),
})

export const VertexProviderSettingsInputSchema =
    VertexProviderConfigSchema.and(ProviderSecretInputSchema)
export const ProviderSettingsInputSchema = ProviderConfigSchema.and(ProviderSecretInputSchema)

const ProviderSecretStatusSchema = z.object({
    credentialType: z.enum(['none', 'adc', 'apiKey', 'serviceAccount', 'aws']),
    apiKeyConfigured: z.boolean(),
    serviceAccountConfigured: z.boolean(),
    awsCredentialsConfigured: z.boolean(),
    apiKeyLocked: z.boolean(),
})

export const VertexProviderSettingsSchema = VertexProviderConfigSchema.and(
    ProviderSecretStatusSchema,
)
export const ProviderSettingsSchema = ProviderConfigSchema.and(ProviderSecretStatusSchema)

export const ModelApiKeySchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(100),
    provider: ProviderKindSchema,
    credentialType: z.enum(['apiKey', 'serviceAccount', 'aws']),
    hint: z.string().max(200),
    configured: z.boolean(),
    locked: z.boolean(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const ModelApiKeyInputSchema = z.object({
    name: z.string().trim().min(1).max(100),
    provider: ProviderKindSchema,
    credentialType: z.enum(['apiKey', 'serviceAccount', 'aws']),
    apiKey: z.string().min(1).max(100_000).optional(),
    serviceAccountJson: z.string().min(1).max(100_000).optional(),
    accessKeyId: z.string().min(1).max(512).optional(),
    awsSecretAccessKey: z.string().min(1).max(10_000).optional(),
    awsSessionToken: z.string().min(1).max(100_000).optional(),
})

export const ModelPresetSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(100),
    config: ProviderConfigSchema,
    apiKeyId: IdSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const ModelPresetInputSchema = z.object({
    name: z.string().trim().min(1).max(100),
    config: ProviderConfigSchema,
    apiKeyId: IdSchema.nullable().default(null),
})

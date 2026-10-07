import type { ProviderKind, TokenizerId } from '@malang/shared'

// RisuAI's tokenizer list; its `tik` counts with o200k, so o200k_base is not listed twice.
export const TOKENIZERS: Array<{ id: TokenizerId; label: string }> = [
    { id: 'tik', label: 'Tiktoken (OpenAI)' },
    { id: 'cl100k_base', label: 'Tiktoken cl100k (GPT-4 이전)' },
    { id: 'mistral', label: 'Mistral' },
    { id: 'novelai', label: 'NovelAI' },
    { id: 'claude', label: 'Claude' },
    { id: 'llama', label: 'Llama' },
    { id: 'llama3', label: 'Llama3' },
    { id: 'novellist', label: 'Novellist' },
    { id: 'gemma', label: 'Gemma' },
    { id: 'cohere', label: 'Cohere' },
    { id: 'deepseek', label: 'DeepSeek' },
    { id: 'deepseek-v4', label: 'DeepSeek V4' },
    { id: 'glm4', label: 'GLM4' },
    { id: 'glm5', label: 'GLM5' },
]

export const PROVIDERS: Array<{
    id: ProviderKind
    label: string
    model: string
    baseUrl?: string
    auth: 'none' | 'key' | 'vertex' | 'aws' | 'unsupported'
}> = [
    {
        id: 'openai',
        label: 'OpenAI',
        model: 'gpt-5-mini',
        baseUrl: 'https://api.openai.com/v1',
        auth: 'key',
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        model: 'openrouter/auto',
        baseUrl: 'https://openrouter.ai/api/v1',
        auth: 'key',
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        model: 'claude-sonnet-4-5',
        baseUrl: 'https://api.anthropic.com/v1',
        auth: 'key',
    },
    { id: 'google', label: 'Google AI Studio', model: 'gemini-2.5-flash', auth: 'key' },
    { id: 'vertex', label: 'Vertex AI', model: 'gemini-2.5-flash', auth: 'vertex' },
    {
        id: 'mistral',
        label: 'Mistral AI',
        model: 'mistral-large-latest',
        baseUrl: 'https://api.mistral.ai/v1',
        auth: 'key',
    },
    {
        id: 'cohere',
        label: 'Cohere',
        model: 'command-r-plus',
        baseUrl: 'https://api.cohere.com',
        auth: 'key',
    },
    {
        id: 'aws',
        label: 'AWS Bedrock',
        model: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
        auth: 'aws',
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com',
        auth: 'key',
    },
    {
        id: 'deepinfra',
        label: 'DeepInfra',
        model: 'deepseek-ai/DeepSeek-V3',
        baseUrl: 'https://api.deepinfra.com/v1/openai',
        auth: 'key',
    },
    {
        id: 'nanogpt',
        label: 'NanoGPT',
        model: 'openai/gpt-5-mini',
        baseUrl: 'https://nano-gpt.com/api/v1',
        auth: 'key',
    },
    { id: 'openai-compatible', label: 'OpenAI Compatible', model: 'model', auth: 'key' },
    {
        id: 'novelai',
        label: 'NovelAI',
        model: 'kayra-v1',
        baseUrl: 'https://text.novelai.net/ai/generate',
        auth: 'key',
    },
    {
        id: 'novellist',
        label: 'NovelList',
        model: 'damsel',
        baseUrl: 'https://api.tringpt.com/api',
        auth: 'key',
    },
    {
        id: 'horde',
        label: 'AI Horde',
        model: 'auto',
        baseUrl: 'https://stablehorde.net/api/v2',
        auth: 'key',
    },
    {
        id: 'ooba',
        label: 'Ooba / Text Generation WebUI',
        model: 'model',
        baseUrl: 'http://127.0.0.1:5000/v1',
        auth: 'key',
    },
    { id: 'mancer', label: 'Mancer / Ooba Legacy', model: 'mancer', auth: 'key' },
    {
        id: 'kobold',
        label: 'KoboldAI',
        model: 'kobold',
        baseUrl: 'http://127.0.0.1:5001',
        auth: 'none',
    },
    {
        id: 'ollama',
        label: 'Ollama',
        model: 'qwen3:latest',
        baseUrl: 'http://127.0.0.1:11434',
        auth: 'none',
    },
    { id: 'echo', label: 'Echo (개발용)', model: 'echo', auth: 'none' },
    { id: 'webllm', label: 'WebLLM', model: 'webllm', auth: 'unsupported' },
    { id: 'plugin', label: '브라우저 플러그인', model: 'plugin', auth: 'unsupported' },
]

export const MODEL_HINTS: Partial<Record<ProviderKind, string[]>> = {
    openai: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'],
    openrouter: ['openrouter/auto', 'openai/gpt-5-mini', 'anthropic/claude-sonnet-4.5'],
    anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
    google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    vertex: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    mistral: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
    cohere: ['command-a-03-2025', 'command-r-plus', 'command-r'],
    aws: [
        'anthropic.claude-sonnet-4-5-20250929-v1:0',
        'amazon.nova-pro-v1:0',
        'amazon.nova-lite-v1:0',
    ],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    deepinfra: ['deepseek-ai/DeepSeek-V3', 'meta-llama/Llama-3.3-70B-Instruct'],
    nanogpt: ['openai/gpt-5-mini', 'anthropic/claude-sonnet-4-5'],
    novelai: ['kayra-v1', 'clio-v1'],
    novellist: ['damsel'],
    horde: ['auto'],
    ollama: ['qwen3:latest', 'gemma3:latest', 'llama3.3:latest'],
    echo: ['echo'],
}

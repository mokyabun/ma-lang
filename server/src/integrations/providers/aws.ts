import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock'
import {
    BedrockRuntimeClient,
    ConverseStreamCommand,
    type Message,
    type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime'

import {
    type ProviderAdapter,
    type ProviderChunk,
    ProviderError,
    type ProviderModel,
    type RuntimeProviderConfig,
} from './types'

export class AwsBedrockAdapter implements ProviderAdapter {
    readonly kind = 'aws' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (config.provider !== 'aws')
            throw new ProviderError('invalid_provider_response', 'Expected an AWS configuration')
        if (!config.modelId) throw new ProviderError('model_not_found', 'A model ID is required')
        if (!config.region)
            throw new ProviderError('provider_unreachable', 'AWS Bedrock requires a region')
        if (config.accessKeyId && !config.awsSecretAccessKey) {
            throw new ProviderError('provider_auth', 'AWS secret access key is missing')
        }
    }

    async healthCheck(config: RuntimeProviderConfig) {
        const models = await this.listModels(config)
        return { ok: true, message: `AWS Bedrock: ${models.length} foundation models available` }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        if (config.provider !== 'aws') return []
        try {
            const response = await controlClient(config).send(new ListFoundationModelsCommand({}))
            return (response.modelSummaries || [])
                .map((model) => ({
                    id: model.modelId || '',
                    name: model.modelName || model.modelId || '',
                    details: {
                        providerName: model.providerName,
                        inputModalities: model.inputModalities,
                        outputModalities: model.outputModalities,
                        responseStreamingSupported: model.responseStreamingSupported,
                    },
                }))
                .filter((model) => model.id)
        } catch (error) {
            throw mapAwsError(error)
        }
    }

    async *streamChat(
        config: RuntimeProviderConfig,
        request: Parameters<ProviderAdapter['streamChat']>[1],
    ): AsyncGenerator<ProviderChunk> {
        this.validateConfig(config)
        if (config.provider !== 'aws') return
        const shaped = shapeMessages(request.messages)
        const input = {
            modelId: config.modelId,
            messages: shaped.messages,
            ...(shaped.system.length ? { system: shaped.system } : {}),
            inferenceConfig: {
                maxTokens: request.parameters.maxOutputTokens,
                temperature: request.parameters.temperature,
                topP: request.parameters.topP,
                stopSequences: request.parameters.stopSequences,
            },
        }
        request.onRequest?.({
            endpoint: `bedrock://${config.region}/${config.modelId}:converse-stream`,
            method: 'POST',
            headers: { authorization: 'AWS SigV4 [redacted]' },
            body: input,
        })
        try {
            const response = await runtimeClient(config).send(new ConverseStreamCommand(input), {
                abortSignal: request.signal,
            })
            if (!response.stream)
                throw new ProviderError(
                    'invalid_provider_response',
                    'Bedrock returned an empty stream',
                )
            for await (const event of response.stream) {
                const text = event.contentBlockDelta?.delta?.text
                if (text) yield { delta: text }
                const usage = event.metadata?.usage
                if (usage) {
                    yield {
                        delta: '',
                        usage: {
                            inputTokens: usage.inputTokens,
                            outputTokens: usage.outputTokens,
                        },
                    }
                }
            }
        } catch (error) {
            if (request.signal.aborted) throw error
            if (error instanceof ProviderError) throw error
            throw mapAwsError(error)
        }
    }
}

function commonConfig(config: Extract<RuntimeProviderConfig, { provider: 'aws' }>) {
    return {
        region: config.region,
        ...(config.accessKeyId && config.awsSecretAccessKey
            ? {
                  credentials: {
                      accessKeyId: config.accessKeyId,
                      secretAccessKey: config.awsSecretAccessKey,
                      sessionToken: config.awsSessionToken,
                  },
              }
            : {}),
    }
}

function runtimeClient(config: Extract<RuntimeProviderConfig, { provider: 'aws' }>) {
    return new BedrockRuntimeClient(commonConfig(config))
}

function controlClient(config: Extract<RuntimeProviderConfig, { provider: 'aws' }>) {
    return new BedrockClient(commonConfig(config))
}

function shapeMessages(messages: Array<{ role: string; content: string }>): {
    system: SystemContentBlock[]
    messages: Message[]
} {
    const system: SystemContentBlock[] = []
    const result: Message[] = []
    for (const message of messages) {
        if (message.role === 'system' && result.length === 0) {
            system.push({ text: message.content })
            continue
        }
        const role = message.role === 'assistant' ? 'assistant' : 'user'
        const text = message.role === 'system' ? `System: ${message.content}` : message.content
        const previous = result.at(-1)
        if (previous?.role === role && previous.content?.[0]?.text) {
            previous.content[0].text += `\n\n${text}`
        } else {
            result.push({ role, content: [{ text }] })
        }
    }
    if (!result.length) result.push({ role: 'user', content: [{ text: 'Start' }] })
    if (result[0]?.role !== 'user') result.unshift({ role: 'user', content: [{ text: 'Start' }] })
    return { system, messages: result }
}

function mapAwsError(error: unknown): ProviderError {
    const message = error instanceof Error ? error.message : String(error)
    if (/credential|access.?denied|unauthorized|signature/i.test(message))
        return new ProviderError('provider_auth', 'AWS Bedrock authentication failed')
    if (/not.?found|resource/i.test(message))
        return new ProviderError('model_not_found', 'AWS Bedrock model was not found')
    if (/throttl|quota|rate/i.test(message))
        return new ProviderError('rate_limited', 'AWS Bedrock rate limit exceeded')
    return new ProviderError('provider_unreachable', message)
}

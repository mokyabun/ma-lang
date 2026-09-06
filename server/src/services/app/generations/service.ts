import { CHAIN_MAIN_NODE_ID, planChainExecution } from '@malang/shared'
import type {
    ChainExecutionNode,
    CompiledMessage,
    GenerationEvent,
    GenerationParameters,
    GenerationRequest,
    ModelChainAgent,
    ModelChainPreset,
    PromptPreview,
    RequestDebugSnapshot,
} from '@malang/shared'
import type { Logger } from 'pino'

import type { Store } from '@/db'
import { ConflictError, ValidationError } from '@/errors/app-error'
import { normalizeError } from '@/errors/normalize'
import type { LuaRuntime } from '@/services/lua'
import type { HypaMemoryV3Service } from '@/services/memory'
import { compilePrompt, mergeGenerationParameters } from '@/services/prompt/compiler'
import { collectRegexScripts, processRegexText } from '@/services/prompt/regex-runtime'
import { providerFor } from '@/services/providers'
import { readPocketRisuProfileBinding } from '@/services/providers/pocketrisu-profile'
import type { ProviderUsage } from '@/services/providers/types'
import type { RuntimeProviderConfig } from '@/services/providers/types'

import type { PersonaService } from '../personas'
import type { ProviderService } from '../providers'
import {
    applyEditProcessToMessages,
    loadGenerationContext,
    normalizeCompiledRole,
    regexTemplateContext,
} from './context'
import { renderDisplayMessages } from './display'
import {
    applyPostMode,
    buildChainExecutionContext,
    chainAgentMessages,
    injectChainNotes,
    parseAgentMemoryOutput,
    type ChainExecutionContext,
    type ChainNote,
} from './model-chain'
import { encodeSse, logGeneration, reconnectGeneration, replayGeneration } from './streams'

export class GenerationConflictError extends ConflictError {}
export class GenerationNotConfiguredError extends ValidationError {}

export class GenerationService {
    private readonly active = new Map<string, AbortController>()

    constructor(
        private readonly store: Store,
        private readonly providers: ProviderService,
        private readonly personas: PersonaService,
        private readonly lua: LuaRuntime,
        private readonly memory: HypaMemoryV3Service,
        private readonly log: Logger,
    ) {}

    async preview(conversationId: string) {
        const context = this.context(conversationId)
        const provider = this.providers.configForConversation(conversationId)
        const parameters = generationParameters(provider, context.preset.parameters)
        const longTermMemory = this.memory.recall(
            conversationId,
            context.messages,
            parameters.maxContextTokens,
        )
        const processed = await applyEditProcessToMessages(context.messages, context)
        const preview = compilePrompt({
            ...context,
            messages: processed.messages,
            parameters,
            longTermMemory,
            includeStartNewChat: isGeminiProvider(provider),
        })
        return { ...preview, warnings: [...new Set([...preview.warnings, ...processed.warnings])] }
    }

    async start(conversationId: string, request: GenerationRequest, requestId: string) {
        const prior = this.store.generation.findByIdempotency(
            conversationId,
            request.idempotencyKey,
        )
        if (prior) {
            if (request.clientInstanceId && prior.status === 'running') {
                return reconnectGeneration(this.store, prior.id, requestId)
            }
            if (request.clientInstanceId && prior.status === 'complete' && prior.messageId) {
                const message = this.store.message.get(prior.messageId)
                if (message) return replayGeneration(prior.id, message)
            }
            throw new GenerationConflictError(
                prior.status === 'running'
                    ? 'This generation request is still running'
                    : 'This generation request already failed or was cancelled',
            )
        }
        if (this.store.generation.findRunning(conversationId))
            throw new GenerationConflictError('A generation is already running')
        let context = this.context(conversationId)
        const reuseLastUserMessage =
            request.mode === 'reply' &&
            request.content === '' &&
            context.messages.at(-1)?.role === 'user'
        if (request.mode === 'reply' && request.content === '' && !reuseLastUserMessage) {
            throw new ValidationError(
                'An empty reply requires a user message at the end of the chat',
            )
        }
        const providerConfig = await this.providers.requireRuntimeForConversation(conversationId)
        const modelChain = context.conversation.modelChainPresetId
            ? this.store.modelChain.get(context.conversation.modelChainPresetId)
            : null
        const clientInstanceId = request.clientInstanceId ?? crypto.randomUUID()
        const luaScriptSnapshot = this.lua.snapshotScripts(conversationId)
        const parameters = generationParameters(providerConfig, context.preset.parameters)
        const generationId = crypto.randomUUID()
        this.store.generation.create({
            id: generationId,
            conversationId,
            messageId: null,
            idempotencyKey: request.idempotencyKey,
            provider: providerConfig.provider,
            modelId: providerConfig.modelId,
            parameters,
        })
        const targetMessage =
            request.mode === 'regenerate' ? this.store.message.lastAssistant(conversationId) : null
        let addedUserMessage: ReturnType<Store['message']['create']> | null = null
        let compileMessages = context.messages
        let scripts = collectRegexScripts(context.preset, context.character, context.modules)
        let templateContext = regexTemplateContext(context)
        let preview: PromptPreview
        let chainContext: ChainExecutionContext | null = null
        let stoppedBeforeProvider = false
        try {
            if (request.mode === 'reply' && !reuseLastUserMessage) {
                await this.lua.executeEvent({
                    conversationId,
                    eventKey: request.idempotencyKey,
                    phase: 'onInput',
                    mode: 'input',
                    clientInstanceId,
                    scriptSnapshot: luaScriptSnapshot,
                })
                const editedInput = await this.lua.executeEvent({
                    conversationId,
                    eventKey: request.idempotencyKey,
                    phase: 'editInput',
                    mode: 'editInput',
                    data: request.content,
                    clientInstanceId,
                    scriptSnapshot: luaScriptSnapshot,
                })
                context = this.context(conversationId)
                scripts = collectRegexScripts(context.preset, context.character, context.modules)
                templateContext = regexTemplateContext(context)
                const processedInput = await processRegexText({
                    text: String(editedInput.data ?? ''),
                    phase: 'editinput',
                    scripts,
                    templateContext,
                })
                addedUserMessage = this.store.message.create(
                    conversationId,
                    'user',
                    processedInput.text,
                    'complete',
                )
            } else if (request.mode === 'regenerate' && !targetMessage) {
                throw new GenerationConflictError('There is no assistant message to regenerate')
            }

            const started = await this.lua.executeEvent({
                conversationId,
                eventKey: request.idempotencyKey,
                phase: 'onStart',
                mode: 'start',
                clientInstanceId,
                scriptSnapshot: luaScriptSnapshot,
            })
            stoppedBeforeProvider = started.stopSending
            context = this.context(conversationId)
            scripts = collectRegexScripts(context.preset, context.character, context.modules)
            templateContext = regexTemplateContext(context)
            compileMessages = targetMessage
                ? context.messages.filter((message) => message.id !== targetMessage.id)
                : context.messages
            const processed = await applyEditProcessToMessages(compileMessages, {
                ...context,
                messages: compileMessages,
            })
            const preliminary = compilePrompt({
                ...context,
                messages: processed.messages,
                parameters,
                includeStartNewChat: isGeminiProvider(providerConfig),
            })
            const longTermMemory = await this.memory.prepare(
                conversationId,
                compileMessages,
                parameters.maxContextTokens,
                preliminary.trimmedMessageIds,
            )
            preview = compilePrompt({
                ...context,
                messages: processed.messages,
                parameters,
                longTermMemory,
                includeStartNewChat: isGeminiProvider(providerConfig),
            })
            preview.warnings = [...new Set([...preview.warnings, ...processed.warnings])]
            chainContext = buildChainExecutionContext(
                context,
                compileMessages,
                longTermMemory.content,
            )
            const editedRequest = await this.lua.executeEvent({
                conversationId,
                eventKey: request.idempotencyKey,
                phase: 'editRequest',
                mode: 'editRequest',
                data: preview.messages,
                clientInstanceId,
                scriptSnapshot: luaScriptSnapshot,
            })
            if (Array.isArray(editedRequest.data)) {
                preview = {
                    ...preview,
                    messages: editedRequest.data.map((message) => ({
                        role:
                            message && typeof message === 'object' && 'role' in message
                                ? normalizeCompiledRole(String(message.role))
                                : 'user',
                        content:
                            message && typeof message === 'object' && 'content' in message
                                ? String(message.content ?? '')
                                : '',
                    })),
                }
            }
        } catch (error) {
            if (addedUserMessage) this.store.message.delete(addedUserMessage.id)
            const normalized = normalizeError(error, requestId)
            this.store.generation.finish(generationId, {
                status: 'failed',
                errorCode: normalized.apiError.code,
                errorMessage: normalized.apiError.message,
            })
            throw error
        }

        const streamingMessage = targetMessage
            ? this.store.message.update(targetMessage.id, {
                  content: '',
                  status: 'streaming',
              })
            : this.store.message.create(conversationId, 'assistant', '', 'streaming')
        if (!streamingMessage) throw new Error('Failed to create assistant message')
        const messageId = streamingMessage.id
        this.store.generation.attachMessage(generationId, messageId)
        const abortController = new AbortController()
        this.active.set(generationId, abortController)
        const startedAt = performance.now()
        let clientConnected = true

        const stream = new ReadableStream<Uint8Array>({
            start: async (controller) => {
                const send = (event: GenerationEvent) => {
                    if (!clientConnected) return
                    try {
                        controller.enqueue(encodeSse(event))
                    } catch {
                        clientConnected = false
                    }
                }
                const close = () => {
                    if (!clientConnected) return
                    clientConnected = false
                    try {
                        controller.close()
                    } catch {}
                }
                send({ type: 'generation.started', generationId, messageId })
                let content = ''
                let processedContent = ''
                let checkpointLength = 0
                let checkpointAt = Date.now()
                let usage: ProviderUsage | undefined
                try {
                    if (stoppedBeforeProvider) {
                        const stopped = this.store.message.update(messageId, {
                            content: '',
                            status: 'cancelled',
                        })
                        this.store.generation.finish(generationId, {
                            status: 'cancelled',
                            outputText: '',
                            processedOutputText: '',
                            errorCode: 'cancelled',
                            errorMessage: 'Lua onStart stopped generation',
                        })
                        if (stopped)
                            send({ type: 'message.completed', generationId, message: stopped })
                        close()
                        return
                    }
                    const runtimeProvider =
                        await this.providers.requireRuntimeForConversation(conversationId)
                    const adapter = providerFor(runtimeProvider)
                    const generateMain = async (notes: ChainNote[]) => {
                        for await (const chunk of adapter.streamChat(runtimeProvider, {
                            messages: injectChainNotes(preview.messages, notes),
                            parameters,
                            signal: abortController.signal,
                            onRequest: (snapshot) => {
                                try {
                                    this.store.requestDebug.create({
                                        generationId,
                                        conversationId,
                                        provider: providerConfig.provider,
                                        modelId: providerConfig.modelId,
                                        parameters,
                                        request: snapshot,
                                    })
                                } catch (error) {
                                    this.log.warn(
                                        { event: 'request_debug.capture_failed', error },
                                        'Failed to capture provider request',
                                    )
                                }
                            },
                        })) {
                            if (chunk.delta) {
                                content += chunk.delta
                                send({
                                    type: 'message.delta',
                                    generationId,
                                    messageId,
                                    delta: chunk.delta,
                                })
                            }
                            if (chunk.usage) usage = chunk.usage
                            if (
                                content.length - checkpointLength >= 512 ||
                                Date.now() - checkpointAt >= 1_000
                            ) {
                                this.store.message.update(messageId, {
                                    content,
                                    status: 'streaming',
                                })
                                checkpointLength = content.length
                                checkpointAt = Date.now()
                            }
                        }
                        return content
                    }
                    content = modelChain
                        ? await this.runModelChain({
                              preset: modelChain,
                              context: chainContext!,
                              generationId,
                              conversationId,
                              signal: abortController.signal,
                              generateMain,
                          })
                        : await generateMain([])
                    const luaOutput = await this.lua.executeEvent({
                        conversationId,
                        eventKey: request.idempotencyKey,
                        phase: 'editOutput',
                        mode: 'editOutput',
                        data: content,
                        clientInstanceId,
                        scriptSnapshot: luaScriptSnapshot,
                    })
                    processedContent = (
                        await processRegexText({
                            text: String(luaOutput.data ?? ''),
                            phase: 'editoutput',
                            scripts,
                            templateContext,
                        })
                    ).text
                    let completed = this.store.message.update(messageId, {
                        content: processedContent,
                        status: 'complete',
                    })
                    if (!completed)
                        throw new Error('Assistant message disappeared during generation')
                    await this.lua.executeEvent({
                        conversationId,
                        eventKey: request.idempotencyKey,
                        phase: 'onOutput',
                        mode: 'output',
                        clientInstanceId,
                        scriptSnapshot: luaScriptSnapshot,
                    })
                    completed =
                        this.store.message.get(messageId) ??
                        this.store.message.lastAssistant(conversationId)
                    if (!completed) throw new Error('Lua onOutput removed the assistant message')
                    processedContent = completed.content
                    this.store.generation.attachMessage(generationId, completed.id)
                    this.store.generation.finish(generationId, {
                        status: 'complete',
                        outputText: content,
                        processedOutputText: processedContent,
                        inputTokens: usage?.inputTokens || preview.estimatedInputTokens,
                        outputTokens: usage?.outputTokens,
                    })
                    logGeneration(
                        this.log,
                        generationId,
                        providerConfig.provider,
                        providerConfig.modelId,
                        startedAt,
                        'complete',
                    )
                    send({
                        type: 'message.snapshot',
                        generationId,
                        messageId: completed.id,
                        content: completed.content,
                    })
                    send({ type: 'message.completed', generationId, message: completed, usage })
                    close()
                } catch (error) {
                    const cancelled = abortController.signal.aborted
                    this.store.message.update(messageId, {
                        content: processedContent || content,
                        status: cancelled ? 'cancelled' : 'failed',
                    })
                    const normalized = normalizeError(error, requestId, { cancelled })
                    const apiError = normalized.apiError
                    this.store.generation.finish(generationId, {
                        status: cancelled ? 'cancelled' : 'failed',
                        outputText: content,
                        processedOutputText: processedContent || content,
                        errorCode: apiError.code,
                        errorMessage: apiError.message,
                    })
                    logGeneration(
                        this.log,
                        generationId,
                        providerConfig.provider,
                        providerConfig.modelId,
                        startedAt,
                        cancelled ? 'cancelled' : 'failed',
                        apiError.code,
                    )
                    if (normalized.unexpected) {
                        this.log.error(
                            {
                                event: 'generation.unhandled_error',
                                requestId,
                                generationId,
                                conversationId,
                                err: normalized.cause,
                            },
                            'Unhandled generation error',
                        )
                    }
                    if (!cancelled) {
                        send({
                            type: 'generation.failed',
                            generationId,
                            messageId,
                            error: apiError,
                        })
                    }
                    close()
                } finally {
                    this.active.delete(generationId)
                }
            },
            cancel: () => {
                clientConnected = false
            },
        })

        return { generationId, stream }
    }

    cancel(generationId: string): boolean {
        const controller = this.active.get(generationId)
        if (!controller) return false
        controller.abort()
        return true
    }

    private async runModelChain(input: {
        preset: ModelChainPreset
        context: ChainExecutionContext
        generationId: string
        conversationId: string
        signal: AbortSignal
        generateMain: (notes: ChainNote[]) => Promise<string>
    }): Promise<string> {
        const plan = planChainExecution(input.preset)
        if (!plan.batches.some((batch) => batch.some((node) => node.agent === null))) {
            throw new Error('The model chain cannot reach the main response due to a cycle')
        }
        let mainResponse = ''
        const completed: { node: ChainExecutionNode; output: string }[] = []
        for (const batch of plan.batches) {
            input.signal.throwIfAborted()
            const results = await Promise.all(
                batch.map(async (node) => {
                    const previous = completed.filter((result) =>
                        node.ancestors.has(result.node.id),
                    )
                    const notes = previous
                        .filter((result) => !result.node.ancestors.has(CHAIN_MAIN_NODE_ID))
                        .map(({ node: { agent, layer }, output }) => ({
                            agentId: agent.id,
                            agentName: agent.name,
                            layerId: layer.id,
                            layerName: layer.name,
                            content: output,
                        }))
                    if (node.agent === null) {
                        mainResponse = await input.generateMain(notes)
                        return null
                    }
                    const { agent, layer, ancestors } = node
                    if (!agent.enabled) return null
                    const receivesResponse = ancestors.has(CHAIN_MAIN_NODE_ID)
                    const response = receivesResponse
                        ? previous
                              .filter((result) => result.node.ancestors.has(CHAIN_MAIN_NODE_ID))
                              .reduce(
                                  (text, result) =>
                                      applyPostMode(
                                          result.node.agent.postMode,
                                          text,
                                          result.output,
                                      ),
                                  mainResponse,
                              )
                        : undefined
                    try {
                        const memory = agent.memoryEnabled
                            ? this.store.modelChainMemory.get(input.conversationId, agent.id)
                            : ''
                        const raw = await this.completeChainAgent(
                            agent,
                            chainAgentMessages(agent, input.context, notes, memory, response),
                            {
                                ...input,
                                chain: {
                                    presetId: input.preset.id,
                                    presetName: input.preset.name,
                                    // Retain the debug contract; graph ancestry determines the input.
                                    phase: receivesResponse ? 'post' : 'pre',
                                    layerId: layer.id,
                                    layerName: layer.name,
                                    agentId: agent.id,
                                    agentName: agent.name,
                                },
                            },
                        )
                        input.signal.throwIfAborted()
                        const result = parseAgentMemoryOutput(raw, agent.memoryEnabled)
                        if (agent.memoryEnabled && result.memoryUpdate) {
                            this.store.modelChainMemory.set(
                                input.conversationId,
                                agent.id,
                                result.memoryUpdate,
                            )
                        }
                        return result.note ? { node, output: result.note } : null
                    } catch (error) {
                        if (input.signal.aborted) throw error
                        this.log.warn(
                            {
                                event: 'model_chain.agent_failed',
                                generationId: input.generationId,
                                chainPresetId: input.preset.id,
                                layerId: layer.id,
                                agentId: agent.id,
                                error,
                            },
                            'Model-chain agent failed; continuing along the graph',
                        )
                        return null
                    }
                }),
            )
            // Commit in graph order, independent of provider completion timing.
            for (const result of results) {
                if (result) completed.push(result)
            }
        }
        return completed
            .filter((result) => result.node.ancestors.has(CHAIN_MAIN_NODE_ID))
            .reduce(
                (text, result) => applyPostMode(result.node.agent.postMode, text, result.output),
                mainResponse,
            )
    }

    private async completeChainAgent(
        agent: ModelChainAgent,
        messages: CompiledMessage[],
        input: {
            generationId: string
            conversationId: string
            signal: AbortSignal
            chain: NonNullable<RequestDebugSnapshot['chain']>
        },
    ): Promise<string> {
        const runtime = await this.providers.requireRuntimeForModelPreset(agent.modelPresetId)
        const parameters = runtime.defaults
        let content = ''
        for await (const chunk of providerFor(runtime).streamChat(runtime, {
            messages,
            parameters,
            signal: input.signal,
            onRequest: (snapshot) =>
                this.captureChainRequest(
                    input.generationId,
                    input.conversationId,
                    runtime,
                    parameters,
                    { ...snapshot, chain: input.chain },
                ),
        })) {
            content += chunk.delta
        }
        return content.trim()
    }

    private captureChainRequest(
        generationId: string,
        conversationId: string,
        runtime: RuntimeProviderConfig,
        parameters: GenerationParameters,
        request: RequestDebugSnapshot,
    ) {
        try {
            this.store.requestDebug.create({
                generationId,
                conversationId,
                provider: runtime.provider,
                modelId: runtime.modelId,
                parameters,
                request,
            })
        } catch (error) {
            this.log.warn(
                { event: 'request_debug.capture_failed', error },
                'Failed to capture model-chain request',
            )
        }
    }

    async messagesWithDisplay(conversationId: string) {
        const context = this.context(conversationId)
        return renderDisplayMessages(this.store, this.lua, conversationId, context)
    }

    private context(conversationId: string) {
        return loadGenerationContext(this.store, this.personas, conversationId)
    }
}

function isGeminiProvider(
    config: { provider: string; apiFormat?: string } | null | undefined,
): boolean {
    return (
        config?.apiFormat === 'google-gemini' ||
        config?.provider === 'google' ||
        config?.provider === 'vertex'
    )
}

function generationParameters(
    provider: {
        provider: string
        apiFormat?: string
        defaults?: GenerationParameters
        providerOptions?: Record<string, unknown>
    } | null,
    promptPreset: GenerationParameters,
) {
    const merged = mergeGenerationParameters(provider?.defaults || {}, promptPreset)
    // PocketRisu reserves output context from the bound Model Preset. Prompt
    // preset sampling can be opt-in there, but its output cap never replaces
    // the model preset's maxOutputTokens.
    if (
        isGeminiProvider(provider) &&
        readPocketRisuProfileBinding(provider?.providerOptions) &&
        provider?.defaults?.maxOutputTokens !== undefined
    ) {
        merged.maxOutputTokens = provider.defaults.maxOutputTokens
    }
    return merged
}

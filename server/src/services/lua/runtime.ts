import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import type {
    CharacterUpdate,
    CompiledMessage,
    LuaScript,
    LuaTriggerRequest,
    Message,
} from '@malang/shared'
import type { Logger } from 'pino'
import { LuaFactory, type LuaEngine } from 'wasmoon'

import type { Store } from '@/db'
import { ConflictError } from '@/errors/app-error'
import { renderTemplate } from '@/services/prompt/template-engine'
import { providerFor } from '@/services/providers'

import { effectivePromptPresetId } from '../app/conversations'
import { conversationModuleStates } from '../app/modules'
import type { PersonaService } from '../app/personas'
import type { ProviderService } from '../app/providers'
import { LuaRemoteCommandError, RemoteRuntime } from './remote-runtime'
import { MiniLmSimilarity } from './similarity'

export type LuaMode = string

export interface LuaPhaseResult<T = unknown> {
    data: T
    stopSending: boolean
    warnings: string[]
    messages: Message[]
    displayEpoch: number
}

export interface LuaScriptOwnerSnapshot {
    type: 'character' | 'module'
    id: string
    order: number
    script: LuaScript
}

interface StagedMessage {
    id?: string
    role: Message['role']
    content: string
    status: Message['status']
}

interface InvocationStage {
    messages: StagedMessage[]
    variables: Record<string, string>
    characterPatch: CharacterUpdate
    moduleBackgroundEmbedding?: string
    loreUpserts: Map<string, unknown>
    changedMessages: boolean
    changedVariables: boolean
    reloadDisplay: boolean
    stopSending: boolean
}

interface InvocationContext {
    token: string
    eventRunId: string
    invocationId: string
    clientInstanceId: string
    conversationId: string
    owner: LuaScriptOwnerSnapshot
    mode: LuaMode
    triggerElementId: string
    allowSafe: boolean
    allowLow: boolean
    displayOnly: boolean
    stage: InvocationStage
    callIndex: number
}

interface CachedEngine {
    engine: LuaEngine
    context: InvocationContext | null
    touchedAt: number
}

export class LuaEventConflictError extends ConflictError {}

export class LuaRuntime {
    readonly remote: RemoteRuntime
    private readonly factory = new LuaFactory()
    private readonly engines = new Map<string, CachedEngine>()
    private readonly activeEvents = new Map<string, Promise<LuaPhaseResult>>()
    private readonly conversationTails = new Map<string, Promise<void>>()
    private readonly ttlMs = 15 * 60_000
    private readonly similarityEngine = new MiniLmSimilarity()
    private readonly requestWindows = new Map<string, { startedAt: number; count: number }>()

    constructor(
        private readonly store: Store,
        private readonly providers: ProviderService,
        private readonly personas: PersonaService,
        private readonly log: Logger,
    ) {
        this.remote = new RemoteRuntime(store)
        store.luaRun.recoverInterrupted()
    }

    async trigger(conversationId: string, request: LuaTriggerRequest): Promise<LuaPhaseResult> {
        if (this.store.generation.findRunning(conversationId)) {
            throw new LuaEventConflictError('Lua triggers are disabled while generation is running')
        }
        return this.executeEvent({
            conversationId,
            eventKey: request.idempotencyKey,
            phase: request.type,
            mode: request.type === 'button' ? 'onButtonClick' : request.name,
            data: request.type === 'button' ? request.data : undefined,
            meta: {
                sourceMessageId: request.sourceMessageId ?? null,
                triggerElementId: request.triggerElementId ?? null,
            },
            clientInstanceId: request.clientInstanceId,
        })
    }

    async executeEvent<T = unknown>(input: {
        conversationId: string
        eventKey: string
        phase: string
        mode: LuaMode
        data?: T
        meta?: Record<string, unknown>
        clientInstanceId: string
        scriptSnapshot?: LuaScriptOwnerSnapshot[]
    }): Promise<LuaPhaseResult<T>> {
        const key = `${input.conversationId}:${input.eventKey}:${input.phase}`
        const running = this.activeEvents.get(key)
        if (running) return running as Promise<LuaPhaseResult<T>>
        const task = this.withConversationLock(input.conversationId, async () => {
            const existing = this.store.luaRun.findEvent(
                input.conversationId,
                input.eventKey,
                input.phase,
            )
            if (existing?.status === 'complete' && existing.result_json) {
                return JSON.parse(existing.result_json) as LuaPhaseResult<T>
            }
            if (existing?.status === 'failed') {
                throw new Error(parseError(existing.error_json, 'Lua event previously failed'))
            }
            const eventRunId = existing?.id ?? crypto.randomUUID()
            if (!existing) {
                this.store.luaRun.startEvent({
                    id: eventRunId,
                    conversationId: input.conversationId,
                    eventKey: input.eventKey,
                    phase: input.phase,
                    clientInstanceId: input.clientInstanceId,
                    input: { data: input.data, meta: input.meta },
                })
            }
            try {
                let data: unknown = input.data
                let stopSending = false
                const warnings: string[] = []
                for (const owner of input.scriptSnapshot ??
                    this.scriptOwners(input.conversationId)) {
                    const result = await this.invoke({
                        eventRunId,
                        conversationId: input.conversationId,
                        clientInstanceId: input.clientInstanceId,
                        owner,
                        mode: input.mode,
                        data,
                        meta: input.meta ?? {},
                    })
                    data = result.data
                    stopSending ||= result.stopSending
                    warnings.push(...result.warnings)
                }
                const conversation = required(
                    this.store.conversation.get(input.conversationId),
                    'Conversation disappeared during Lua event',
                )
                const result: LuaPhaseResult<T> = {
                    data: data as T,
                    stopSending,
                    warnings,
                    messages: this.store.message.list(input.conversationId),
                    displayEpoch: conversation.displayEpoch,
                }
                this.store.luaRun.completeEvent(eventRunId, result)
                return result
            } catch (error) {
                this.store.luaRun.failEvent(eventRunId, errorJson(error))
                throw error
            }
        })
        this.activeEvents.set(key, task as Promise<LuaPhaseResult>)
        try {
            return await task
        } finally {
            this.activeEvents.delete(key)
        }
    }

    scriptSetHash(conversationId: string): string {
        return createHash('sha256')
            .update(
                this.scriptOwners(conversationId)
                    .map(
                        (owner) =>
                            `${owner.type}:${owner.id}:${owner.script.revision}:${owner.script.codeSha256}`,
                    )
                    .join('|'),
            )
            .digest('hex')
    }

    snapshotScripts(conversationId: string): LuaScriptOwnerSnapshot[] {
        return structuredClone(this.scriptOwners(conversationId))
    }

    close() {
        for (const cached of this.engines.values()) cached.engine.global.close()
        this.engines.clear()
    }

    private async invoke(input: {
        eventRunId: string
        conversationId: string
        clientInstanceId: string
        owner: LuaScriptOwnerSnapshot
        mode: LuaMode
        data: unknown
        meta: Record<string, unknown>
    }) {
        const existing = this.store.luaRun.findInvocation(
            input.eventRunId,
            input.owner.type,
            input.owner.id,
            input.owner.script.revision,
        )
        if (existing?.status === 'complete') {
            const result = JSON.parse(existing.result_json || '{}') as {
                data: unknown
                stopSending: boolean
            }
            return { ...result, warnings: JSON.parse(existing.warnings_json || '[]') as string[] }
        }
        const invocationId = existing?.id ?? crypto.randomUUID()
        if (!existing) {
            this.store.luaRun.startInvocation({
                id: invocationId,
                eventRunId: input.eventRunId,
                ownerType: input.owner.type,
                ownerId: input.owner.id,
                scriptRevision: input.owner.script.revision,
                sequence: input.owner.order,
            })
        }
        const permissions = permissionsFor(input.mode, input.owner.script.lowLevelAccess)
        const context: InvocationContext = {
            token: crypto.randomUUID(),
            eventRunId: input.eventRunId,
            invocationId,
            clientInstanceId: input.clientInstanceId,
            conversationId: input.conversationId,
            owner: input.owner,
            mode: input.mode,
            triggerElementId:
                typeof input.meta.triggerElementId === 'string' ? input.meta.triggerElementId : '',
            ...permissions,
            stage: this.createStage(input.conversationId),
            callIndex: 0,
        }
        const warnings: string[] = []
        let data = input.data
        try {
            const cached = await this.engineFor(context)
            cached.context = context
            let callback: unknown
            try {
                if (isEditMode(input.mode)) {
                    const func = cached.engine.global.get('callListenMain')
                    if (typeof func === 'function') {
                        const encoded = await func(
                            input.mode,
                            context.token,
                            JSON.stringify(data),
                            JSON.stringify(input.meta),
                        )
                        data = JSON.parse(String(encoded))
                    }
                } else {
                    const func = cached.engine.global.get(input.mode)
                    if (typeof func === 'function') {
                        callback =
                            input.mode === 'onButtonClick'
                                ? await func(
                                      context.token,
                                      typeof data === 'string' ? data : JSON.stringify(data ?? ''),
                                  )
                                : await func(context.token)
                    }
                }
                if (callback === false) context.stage.stopSending = true
            } catch (error) {
                if (isFatalInvocationError(error)) throw error
                const warning = `Lua callback ${input.mode} failed for ${input.owner.type}:${input.owner.id}: ${errorMessage(error)}`
                warnings.push(warning)
                this.log.warn({ event: 'lua.callback_failed', err: error, ...input }, warning)
            } finally {
                cached.context = null
            }
            this.commitStage(context)
            const result = { data, stopSending: context.stage.stopSending }
            this.store.luaRun.completeInvocation(invocationId, result, warnings)
            return { ...result, warnings }
        } catch (error) {
            this.disposeEngine(context)
            this.store.luaRun.failInvocation(invocationId, errorJson(error), warnings)
            throw error
        }
    }

    private async engineFor(context: InvocationContext): Promise<CachedEngine> {
        this.evictOldEngines()
        const key = this.engineKey(context)
        const existing = this.engines.get(key)
        if (existing) {
            existing.touchedAt = Date.now()
            return existing
        }
        const engine = await this.factory.createEngine({
            injectObjects: true,
            functionTimeout: 2_000,
        })
        const cached: CachedEngine = { engine, context, touchedAt: Date.now() }
        this.declareHostApis(cached)
        try {
            await engine.doString(luaWrapper(context.owner.script.code))
        } catch (error) {
            engine.global.close()
            throw new Error(`Lua load failed: ${errorMessage(error)}`)
        }
        this.engines.set(key, cached)
        return cached
    }

    private declareHostApis(cached: CachedEngine) {
        const engine = cached.engine
        const context = (token?: unknown) => {
            const current = cached.context
            if (!current || token !== current.token)
                throw new Error('Invalid or expired Lua access token')
            return current
        }
        const safe = (token?: unknown) => {
            const current = context(token)
            if (!current.allowSafe) throw new Error(`API is not permitted in ${current.mode}`)
            return current
        }
        const writable = (token?: unknown) => {
            const current = context(token)
            if (!current.allowSafe && !current.displayOnly)
                throw new Error(`Write API is not permitted in ${current.mode}`)
            return current
        }
        const low = (token?: unknown) => {
            const current = context(token)
            if (!current.allowLow)
                throw new Error(`Low-level API is not permitted in ${current.mode}`)
            return current
        }
        const set = (name: string, fn: (...args: any[]) => unknown) => engine.global.set(name, fn)

        set('__jsonEncode', (value) => JSON.stringify(value))
        set('__jsonDecode', (value) => decodeLuaJson(JSON.parse(String(value))))
        set('getChatVar', (token, key) => this.getChatVar(context(token), String(key)))
        set('setChatVar', (token, key, value) => {
            const current = writable(token)
            current.stage.variables[String(key)] = String(value ?? '')
            current.stage.changedVariables = true
        })
        set(
            'getGlobalVar',
            (token, key) =>
                context(token) &&
                (this.store.settings.get().globalVariables[String(key)] ?? 'null'),
        )
        set('getChatMain', (token, index) => {
            const message = at(context(token).stage.messages, Number(index))
            return JSON.stringify(
                message ? { role: luaRole(message.role), data: message.content, time: 0 } : null,
            )
        })
        set('getFullChatMain', (token) =>
            JSON.stringify(
                context(token).stage.messages.map((message) => ({
                    role: luaRole(message.role),
                    data: message.content,
                    time: 0,
                })),
            ),
        )
        set('getChatLength', (token) => context(token).stage.messages.length)
        set('setChat', (token, index, value) => {
            const current = safe(token)
            const message = at(current.stage.messages, Number(index))
            if (message) {
                message.content = String(value ?? '')
                current.stage.changedMessages = true
            }
        })
        set('setChatRole', (token, index, value) => {
            const current = safe(token)
            const message = at(current.stage.messages, Number(index))
            if (message) {
                message.role = dbRole(String(value))
                current.stage.changedMessages = true
            }
        })
        set('setFullChatMain', (token, value) => {
            const current = safe(token)
            const decoded = JSON.parse(String(value))
            if (!Array.isArray(decoded)) throw new Error('setFullChat expects an array')
            current.stage.messages = decoded.map((item) => ({
                role: dbRole(String(item?.role)),
                content: String(item?.data ?? ''),
                status: 'complete',
            }))
            current.stage.changedMessages = true
        })
        set('cutChat', (token, start, end) => {
            const current = safe(token)
            current.stage.messages = current.stage.messages.slice(Number(start), Number(end))
            current.stage.changedMessages = true
        })
        set('removeChat', (token, index) => {
            const current = safe(token)
            const normalized = normalizeIndex(current.stage.messages.length, Number(index))
            if (normalized >= 0 && normalized < current.stage.messages.length) {
                current.stage.messages.splice(normalized, 1)
                current.stage.changedMessages = true
            }
        })
        set('addChat', (token, role, value) => {
            const current = safe(token)
            current.stage.messages.push({
                role: dbRole(String(role)),
                content: String(value ?? ''),
                status: 'complete',
            })
            current.stage.changedMessages = true
        })
        set('insertChat', (token, index, role, value) => {
            const current = safe(token)
            current.stage.messages.splice(Number(index), 0, {
                role: dbRole(String(role)),
                content: String(value ?? ''),
                status: 'complete',
            })
            current.stage.changedMessages = true
        })
        set('stopChat', (token) => {
            safe(token).stage.stopSending = true
        })
        set('sleep', (token, milliseconds) => {
            safe(token)
            return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(milliseconds))))
        })
        set('reloadDisplay', (token) => {
            safe(token).stage.reloadDisplay = true
        })
        set('reloadChat', (token) => {
            const current = safe(token)
            return this.remote.issue({
                invocationId: current.invocationId,
                callIndex: ++current.callIndex,
                clientInstanceId: current.clientInstanceId,
                kind: 'reloadChat',
                payload: {},
                blocking: false,
            })
        })
        for (const kind of ['alertNormal', 'alertError'] as const) {
            set(kind, (token, value) => {
                const current = safe(token)
                return this.remote.issue({
                    invocationId: current.invocationId,
                    callIndex: ++current.callIndex,
                    clientInstanceId: current.clientInstanceId,
                    kind,
                    payload: { message: String(value ?? '') },
                    blocking: false,
                })
            })
        }
        set('alertInput', (token, value) =>
            this.blockingCommand(safe(token), 'alertInput', { message: String(value ?? '') }),
        )
        set('alertSelect', (token, value) =>
            this.blockingCommand(safe(token), 'alertSelect', { options: value }),
        )
        set('alertConfirm', (token, value) =>
            this.blockingCommand(safe(token), 'alertConfirm', { message: String(value ?? '') }),
        )
        set('logMain', (value) =>
            this.log.info({ event: 'lua.log', value: String(value) }, 'Lua log'),
        )
        set('hash', (_token, value) => createHash('sha256').update(String(value)).digest('hex'))
        set(
            'getTokens',
            (token, value) => context(token) && Math.ceil(Array.from(String(value)).length / 4),
        )
        set('cbs', (value) => {
            if (!cached.context) throw new Error('No active Lua invocation')
            return this.renderCbs(cached.context, String(value))
        })

        set('getName', (token) => this.character(context(token)).name)
        set('setName', (token, value) => (safe(token).stage.characterPatch.name = String(value)))
        set('getDescription', (token) => this.character(context(token)).description)
        set(
            'setDescription',
            (token, value) => (safe(token).stage.characterPatch.description = String(value)),
        )
        set('getCharacterFirstMessage', (token) => this.character(context(token)).firstMessage)
        set(
            'setCharacterFirstMessage',
            (token, value) => (safe(token).stage.characterPatch.firstMessage = String(value)),
        )
        set('getPersonaName', (token) => this.persona(context(token)).name)
        set('getPersonaDescription', (token) => this.persona(context(token)).description)
        set('getAuthorsNote', (token) => this.conversation(context(token)).authorNote)
        set('getBackgroundEmbedding', (token) => {
            const current = context(token)
            return current.owner.type === 'module'
                ? this.store.promptModule.get(current.owner.id)?.backgroundEmbedding || ''
                : ''
        })
        set('setBackgroundEmbedding', (token, value) => {
            const current = safe(token)
            if (current.owner.type !== 'module') return
            current.stage.moduleBackgroundEmbedding = String(value)
        })
        set(
            'getCharacterLastMessage',
            (token) =>
                [...context(token).stage.messages].reverse().find((m) => m.role === 'assistant')
                    ?.content ?? '',
        )
        set(
            'getUserLastMessage',
            (token) =>
                [...context(token).stage.messages].reverse().find((m) => m.role === 'user')
                    ?.content ?? '',
        )
        set('getCharacterImageMain', (token) =>
            Promise.resolve(this.assetReference(this.character(context(token)).avatarAssetId)),
        )
        set('getPersonaImageMain', (token) =>
            Promise.resolve(this.assetReference(this.persona(context(token)).avatarAssetId)),
        )

        set('getLoreBooksMain', (token, search) =>
            JSON.stringify(this.loreBooks(context(token), String(search ?? ''))),
        )
        set('loadLoreBooksMain', (token) => {
            const current = low(token)
            return Promise.resolve(
                JSON.stringify(
                    this.loreBooks(current, '').map((entry) => ({
                        data: String(isRecord(entry) ? (entry.content ?? '') : entry),
                        role:
                            isRecord(entry) && entry.role === 'assistant'
                                ? 'char'
                                : isRecord(entry) && typeof entry.role === 'string'
                                  ? entry.role
                                  : 'system',
                    })),
                ),
            )
        })
        set('upsertLocalLoreBook', (token, name, content, options) => {
            const current = safe(token)
            const settings = isRecord(options) ? options : {}
            current.stage.loreUpserts.set(String(name), {
                name: String(name),
                comment: String(name),
                content: String(content ?? ''),
                constant: settings.alwaysActive === true,
                alwaysActive: settings.alwaysActive === true,
                insertionOrder:
                    typeof settings.insertOrder === 'number' ? settings.insertOrder : 100,
                keys: typeof settings.key === 'string' ? settings.key.split(',') : [],
                secondaryKeys:
                    typeof settings.secondKey === 'string' ? settings.secondKey.split(',') : [],
                useRegex: settings.regex === true,
                enabled: true,
            })
            return true
        })

        set('LLMMain', (token, prompt, _multimodal, options) =>
            this.llm(low(token), String(prompt), String(options || '{}')),
        )
        set('axLLMMain', (token, prompt, multimodal, options) =>
            this.llm(low(token), String(prompt), String(options || '{}'), true),
        )
        set('simpleLLM', async (token, prompt) => {
            const result = JSON.parse(
                await this.llm(
                    low(token),
                    JSON.stringify([{ role: 'user', content: String(prompt) }]),
                    '{}',
                ),
            )
            return result
        })
        set('request', (token, url, options) => this.request(low(token), String(url), options))
        set('similarity', (token, source, values) => {
            low(token)
            const candidates = Array.isArray(values)
                ? values.map(String)
                : isRecord(values)
                  ? Object.values(values).map(String)
                  : []
            return this.similarityEngine.rank(String(source), candidates)
        })
        set('generateImage', (token) => low(token) && 'Error: Image generation is not configured')

        // PocketRisu exposes these implementation names as public-compatible aliases.
        set('setFullChat', (...args) => engine.global.get('setFullChatMain')(...args))
    }

    private blockingCommand(current: InvocationContext, kind: string, payload: unknown) {
        return this.remote.issue({
            invocationId: current.invocationId,
            callIndex: ++current.callIndex,
            clientInstanceId: current.clientInstanceId,
            kind,
            payload,
            blocking: true,
        })
    }

    private async llm(
        current: InvocationContext,
        promptJson: string,
        _optionsJson: string,
        auxiliary = false,
    ) {
        return this.journal(current, auxiliary ? 'axLLM' : 'LLM', { promptJson }, async () => {
            const prompt = JSON.parse(promptJson)
            if (!Array.isArray(prompt)) throw new Error('LLM prompt must be an array')
            const messages: CompiledMessage[] = prompt.map((message) => ({
                role: normalizeModelRole(String(message?.role)),
                content: String(message?.content ?? ''),
            }))
            const selectedRuntime = await this.providers.requireRuntimeForConversation(
                current.conversationId,
                auxiliary,
            )
            const adapter = providerFor(selectedRuntime)
            const controller = new AbortController()
            let result = ''
            for await (const chunk of adapter.streamChat(selectedRuntime, {
                messages,
                parameters: selectedRuntime.defaults,
                signal: controller.signal,
            })) {
                result += chunk.delta
            }
            return JSON.stringify({ success: true, result })
        })
    }

    private async request(current: InvocationContext, url: string, options: unknown) {
        const rateKey = `${current.conversationId}:${current.owner.type}:${current.owner.id}`
        const now = Date.now()
        const window = this.requestWindows.get(rateKey)
        const activeWindow =
            !window || now - window.startedAt >= 60_000 ? { startedAt: now, count: 0 } : window
        if (activeWindow.count >= 5) {
            return JSON.stringify({
                status: 429,
                data: 'Too many requests. Maximum is 5 per minute',
            })
        }
        activeWindow.count += 1
        this.requestWindows.set(rateKey, activeWindow)
        try {
            return await this.journal(current, 'request', { url, options }, async () => {
                const parsed = new URL(url)
                if (parsed.protocol !== 'https:') throw new Error('Only HTTPS requests are allowed')
                await assertPublicHost(parsed.hostname)
                const decoded = typeof options === 'string' ? JSON.parse(options || '{}') : options
                const option = isRecord(decoded) ? decoded : {}
                const controller = new AbortController()
                const timer = setTimeout(() => controller.abort(), 15_000)
                try {
                    let currentUrl = parsed
                    for (let redirects = 0; redirects <= 3; redirects += 1) {
                        const response = await fetch(currentUrl, {
                            method: typeof option.method === 'string' ? option.method : 'GET',
                            headers: isRecord(option.headers)
                                ? (option.headers as Record<string, string>)
                                : undefined,
                            body: typeof option.body === 'string' ? option.body : undefined,
                            redirect: 'manual',
                            signal: controller.signal,
                        })
                        if (
                            response.status >= 300 &&
                            response.status < 400 &&
                            response.headers.get('location')
                        ) {
                            currentUrl = new URL(response.headers.get('location')!, currentUrl)
                            if (currentUrl.protocol !== 'https:')
                                throw new Error('Unsafe redirect protocol')
                            await assertPublicHost(currentUrl.hostname)
                            continue
                        }
                        const reader = response.body?.getReader()
                        const chunks: Uint8Array[] = []
                        let size = 0
                        while (reader) {
                            const { done, value } = await reader.read()
                            if (done) break
                            size += value.length
                            if (size > 2 * 1024 * 1024) throw new Error('Response is too large')
                            chunks.push(value)
                        }
                        const bytes = new Uint8Array(size)
                        let offset = 0
                        for (const chunk of chunks) {
                            bytes.set(chunk, offset)
                            offset += chunk.length
                        }
                        return JSON.stringify({
                            status: response.status,
                            data: new TextDecoder().decode(bytes),
                        })
                    }
                    throw new Error('Too many redirects')
                } finally {
                    clearTimeout(timer)
                }
            })
        } catch (error) {
            return JSON.stringify({ status: 400, data: errorMessage(error) })
        }
    }

    private async journal<T>(
        current: InvocationContext,
        operation: string,
        request: unknown,
        call: () => Promise<T>,
    ): Promise<T> {
        const callIndex = ++current.callIndex
        const existing = this.store.luaRun.findApiCall(current.invocationId, callIndex)
        if (existing?.status === 'complete') return JSON.parse(existing.result_json || 'null') as T
        if (existing?.status === 'indeterminate')
            throw new Error('External API result is indeterminate; automatic retry is disabled')
        if (!existing) {
            this.store.luaRun.startApiCall({
                invocationId: current.invocationId,
                callIndex,
                operation,
                request,
            })
        }
        try {
            const result = await call()
            this.store.luaRun.completeApiCall(current.invocationId, callIndex, result)
            return result
        } catch (error) {
            this.store.luaRun.failApiCall(current.invocationId, callIndex, errorJson(error))
            throw error
        }
    }

    private createStage(conversationId: string): InvocationStage {
        const conversation = required(
            this.store.conversation.get(conversationId),
            'Conversation not found',
        )
        return {
            messages: this.store.message.list(conversationId).map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                status: message.status,
            })),
            variables: { ...conversation.variables },
            characterPatch: {},
            moduleBackgroundEmbedding: undefined,
            loreUpserts: new Map(),
            changedMessages: false,
            changedVariables: false,
            reloadDisplay: false,
            stopSending: false,
        }
    }

    private commitStage(current: InvocationContext) {
        const stage = current.stage
        let epochBumped = false
        if (stage.changedMessages) {
            this.store.message.replace(current.conversationId, stage.messages)
            epochBumped = true
        }
        if (stage.changedVariables) {
            this.store.conversation.setVariables(current.conversationId, stage.variables)
            for (const [key, value] of Object.entries(stage.variables)) {
                if (!key.startsWith('__')) continue
                this.store.luaState.upsert({
                    conversationId: current.conversationId,
                    ownerType: current.owner.type,
                    ownerId: current.owner.id,
                    key: key.slice(2),
                    value,
                })
            }
            if (!epochBumped && current.mode !== 'editDisplay') {
                this.store.message.bumpDisplayEpoch(current.conversationId)
                epochBumped = true
            }
        }
        if (Object.keys(stage.characterPatch).length) {
            this.store.character.update(
                this.conversation(current).characterId,
                stage.characterPatch,
            )
            if (!epochBumped) this.store.message.bumpDisplayEpoch(current.conversationId)
            epochBumped = true
        }
        if (stage.moduleBackgroundEmbedding !== undefined && current.owner.type === 'module') {
            const module = this.store.promptModule.get(current.owner.id)
            if (module) {
                this.store.promptModule.update(module.id, {
                    ...module,
                    backgroundEmbedding: stage.moduleBackgroundEmbedding,
                    luaScript: undefined,
                })
                if (!epochBumped) this.store.message.bumpDisplayEpoch(current.conversationId)
                epochBumped = true
            }
        }
        for (const [name, entry] of stage.loreUpserts) {
            this.store.conversationLore.upsert(current.conversationId, name, entry)
        }
        if ((stage.reloadDisplay || stage.loreUpserts.size) && !epochBumped) {
            this.store.message.bumpDisplayEpoch(current.conversationId)
        }
    }

    private getChatVar(current: InvocationContext, key: string): string {
        if (Object.hasOwn(current.stage.variables, key)) return current.stage.variables[key]!
        const character = this.character(current)
        if (Object.hasOwn(character.defaultVariables, key)) return character.defaultVariables[key]!
        const conversation = this.conversation(current)
        const preset = this.store.promptPreset.get(
            effectivePromptPresetId(conversation, this.store.settings.get()),
        )
        if (preset && Object.hasOwn(preset.defaultVariables, key))
            return preset.defaultVariables[key]!
        return 'null'
    }

    private renderCbs(current: InvocationContext, value: string) {
        const character = this.character(current)
        const persona = this.persona(current)
        return renderTemplate(value, {
            values: {
                char: character.name,
                user: persona.name,
                triggerid: current.triggerElementId,
                trigger_id: current.triggerElementId,
            },
            variables: current.stage.variables,
            globalVariables: this.store.settings.get().globalVariables,
            toggles: {},
            messages: current.stage.messages,
        }).text
    }

    private loreBooks(current: InvocationContext, search: string) {
        const needle = search.toLocaleLowerCase()
        const character = this.character(current)
        const modules = conversationModuleStates(this.store, current.conversationId)
            .filter((state) => state.enabled)
            .flatMap((state) => state.module.lorebook)
        const local = this.store.conversationLore.list(current.conversationId)
        return [...(character.lorebook || []), ...modules, ...local].filter((entry) => {
            if (!needle) return true
            if (!isRecord(entry)) return false
            const name =
                typeof entry.name === 'string'
                    ? entry.name
                    : typeof entry.comment === 'string'
                      ? entry.comment
                      : ''
            return name.toLocaleLowerCase() === needle
        })
    }

    private scriptOwners(conversationId: string): LuaScriptOwnerSnapshot[] {
        const conversation = required(
            this.store.conversation.get(conversationId),
            'Conversation not found',
        )
        const character = required(
            this.store.character.get(conversation.characterId),
            'Character not found',
        )
        const result: LuaScriptOwnerSnapshot[] = []
        if (character.luaScript?.enabled) {
            result.push({
                type: 'character',
                id: character.id,
                order: -1,
                script: character.luaScript,
            })
        }
        result.push(
            ...conversationModuleStates(this.store, conversationId)
                .filter((state) => state.enabled && state.module.luaScript?.enabled)
                .sort(
                    (a, b) =>
                        a.module.runtimeOrder - b.module.runtimeOrder ||
                        a.module.id.localeCompare(b.module.id),
                )
                .map((state, index) => ({
                    type: 'module' as const,
                    id: state.module.id,
                    order: index,
                    script: state.module.luaScript!,
                })),
        )
        return result
    }

    private character(current: InvocationContext) {
        const conversation = this.conversation(current)
        return required(this.store.character.get(conversation.characterId), 'Character not found')
    }

    private conversation(current: InvocationContext) {
        return required(
            this.store.conversation.get(current.conversationId),
            'Conversation not found',
        )
    }

    private persona(current: InvocationContext) {
        return this.personas.effectiveFor(this.conversation(current), this.store.settings.get())
    }

    private assetReference(assetId: string | null) {
        return assetId ? `{{inlay::${assetId}}}` : ''
    }

    private async withConversationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
        const previous = this.conversationTails.get(key) ?? Promise.resolve()
        let release!: () => void
        const tail = new Promise<void>((resolve) => (release = resolve))
        const chained = previous.then(() => tail)
        this.conversationTails.set(key, chained)
        await previous
        try {
            return await task()
        } finally {
            release()
            if (this.conversationTails.get(key) === chained) this.conversationTails.delete(key)
        }
    }

    private engineKey(current: InvocationContext) {
        return [
            current.conversationId,
            current.owner.type,
            current.owner.id,
            current.owner.script.revision,
            current.mode,
        ].join(':')
    }

    private disposeEngine(current: InvocationContext) {
        const key = this.engineKey(current)
        this.engines.get(key)?.engine.global.close()
        this.engines.delete(key)
    }

    private evictOldEngines() {
        const expired = Date.now() - this.ttlMs
        for (const [key, cached] of this.engines) {
            if (cached.touchedAt >= expired || cached.context) continue
            cached.engine.global.close()
            this.engines.delete(key)
        }
    }
}

function luaWrapper(code: string) {
    return `
json = { encode = __jsonEncode, decode = __jsonDecode }

function getChat(id, index) return json.decode(getChatMain(id, index)) end
function getFullChat(id) return json.decode(getFullChatMain(id)) end
function setFullChat(id, value) return setFullChatMain(id, json.encode(value)) end
function log(value) return logMain(json.encode(value)) end
function getLoreBooks(id, search) return json.decode(getLoreBooksMain(id, search)) end
function loadLoreBooks(id) return json.decode(loadLoreBooksMain(id):await()) end
function LLM(id, prompt, useMultimodal, options)
  return json.decode(LLMMain(id, json.encode(prompt), useMultimodal or false, json.encode(options or {})):await())
end
function axLLM(id, prompt, useMultimodal, options)
  return json.decode(axLLMMain(id, json.encode(prompt), useMultimodal or false, json.encode(options or {})):await())
end
function getCharacterImage(id) return getCharacterImageMain(id):await() end
function getPersonaImage(id) return getPersonaImageMain(id):await() end

local editRequestFuncs, editDisplayFuncs, editInputFuncs, editOutputFuncs = {}, {}, {}, {}
function listenEdit(type, func)
  local lists = { editRequest=editRequestFuncs, editDisplay=editDisplayFuncs,
                  editInput=editInputFuncs, editOutput=editOutputFuncs }
  if not lists[type] then error('Invalid edit listener type') end
  lists[type][#lists[type] + 1] = func
end

function getState(id, name) return json.decode(getChatVar(id, '__'..name)) end
function setState(id, name, value) setChatVar(id, '__'..name, json.encode(value)) end

function async(callback)
  return function(...)
    local co = coroutine.create(callback)
    local safe, result = coroutine.resume(co, ...)
    return Promise.create(function(resolve, reject)
      local checkresult
      local step = function()
        if coroutine.status(co) == 'dead' then return (safe and resolve or reject)(result) end
        safe, result = coroutine.resume(co)
        checkresult()
      end
      checkresult = function()
        if safe and result == Promise.resolve(result) then result:finally(step) else step() end
      end
      checkresult()
    end)
  end
end

callListenMain = async(function(type, id, value, meta)
  local realValue, realMeta = json.decode(value), json.decode(meta)
  local lists = { editRequest=editRequestFuncs, editDisplay=editDisplayFuncs,
                  editInput=editInputFuncs, editOutput=editOutputFuncs }
  for _, func in ipairs(lists[type] or {}) do realValue = func(id, realValue, realMeta) end
  return json.encode(realValue)
end)

local nativePrint = print
print = function(...) local values = {...}; logMain(json.encode(values)) end

${code}
`
}

function permissionsFor(mode: LuaMode, lowLevelAccess: boolean) {
    if (mode === 'editDisplay') {
        return { allowSafe: false, allowLow: false, displayOnly: true }
    }
    if (mode === 'editInput' || mode === 'editOutput' || mode === 'editRequest') {
        return { allowSafe: true, allowLow: false, displayOnly: false }
    }
    return { allowSafe: true, allowLow: lowLevelAccess, displayOnly: false }
}

function isEditMode(mode: string) {
    return ['editInput', 'editOutput', 'editDisplay', 'editRequest'].includes(mode)
}

function luaRole(role: Message['role']) {
    return role === 'assistant' ? 'char' : role
}

function dbRole(role: string): Message['role'] {
    if (role === 'user') return 'user'
    if (role === 'system') return 'system'
    return 'assistant'
}

function at<T>(values: T[], index: number): T | undefined {
    return values[normalizeIndex(values.length, index)]
}

function normalizeIndex(length: number, index: number) {
    const integer = Math.trunc(index)
    return integer < 0 ? length + integer : integer
}

function normalizeModelRole(role: string): CompiledMessage['role'] {
    if (role === 'system' || role === 'sys') return 'system'
    if (role === 'user') return 'user'
    return 'assistant'
}

async function assertPublicHost(hostname: string) {
    if (hostname.toLocaleLowerCase() === 'localhost' || hostname.endsWith('.localhost')) {
        throw new Error('Private, link-local, and metadata network targets are blocked')
    }
    const addresses = isIP(hostname)
        ? [{ address: hostname }]
        : await lookup(hostname, { all: true, verbatim: true })
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
        throw new Error('Private, link-local, and metadata network targets are blocked')
    }
}

function isPrivateAddress(address: string) {
    const normalized = address.toLocaleLowerCase()
    if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7))
    if (
        normalized === '::' ||
        normalized === '::1' ||
        normalized === '0.0.0.0' ||
        normalized === '169.254.169.254'
    )
        return true
    if (
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
    )
        return true
    const parts = normalized.split('.').map(Number)
    if (parts.length !== 4 || parts.some(Number.isNaN)) return false
    return (
        parts[0] === 10 ||
        parts[0] === 127 ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127)
    )
}

function required<T>(value: T | null | undefined, message: string): T {
    if (value === null || value === undefined) throw new Error(message)
    return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function decodeLuaJson(value: unknown): unknown {
    if (value === null) return undefined
    if (Array.isArray(value)) return value.map(decodeLuaJson)
    if (!isRecord(value)) return value
    return Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) =>
            item === null ? [] : [[key, decodeLuaJson(item)]],
        ),
    )
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

function errorJson(error: unknown) {
    return { message: errorMessage(error), name: error instanceof Error ? error.name : 'Error' }
}

function parseError(value: string | null, fallback: string) {
    try {
        return String(JSON.parse(value || '{}').message || fallback)
    } catch {
        return fallback
    }
}

function isTimeoutError(error: unknown) {
    return /timeout|execution timeout|deadline/i.test(errorMessage(error))
}

function isFatalInvocationError(error: unknown) {
    return (
        isTimeoutError(error) ||
        error instanceof LuaRemoteCommandError ||
        /initiating client|remote command expired/i.test(errorMessage(error))
    )
}

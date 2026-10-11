import {
    type BackgroundJob,
    type CompiledMessage,
    DEFAULT_ANALYSIS_INSTRUCTION,
    type IllustrationActor,
    type IllustrationCount,
    type IllustrationState,
    type IllustrationStateDefinition,
    IllustrationCountSchema,
    illustrationTokenIds,
    type Message,
    type MessageIllustration,
} from '@malang/shared'
import type { Logger } from 'pino'
import { z } from 'zod'

import type { NewMessageIllustration, Store } from '@/db'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors/app-error'
import type { AssetStore } from '@/modules/assets/service'
import type { GenerationCompletedEvent } from '@/services/app/generations'
import type { ProviderService } from '@/services/app/providers'
import type { RuntimeEventHub } from '@/services/app/runtime-events'
import { type JobContext, type JobRunner, RetryableJobError } from '@/services/jobs'
import { providerFor } from '@/services/providers'

import { actorRefs, type AnalysisInput, type AnalysisPlan, runAnalysis } from './analysis'
import { applyContinuity, stateTags } from './continuity'
import type { ContinuityService } from './continuity-service'
import { NovelAIImageError } from './novelai'
import { composePrompt, resolveImageParams } from './prompt'
import { NOVELAI_LANE, type IllustrationService } from './service'
import { insertTokens, plainText, removeTokens, splitParagraphs } from './slots'

export const PLAN_JOB = 'illustration.plan'
export const RENDER_JOB = 'illustration.render'
export const TRACK_JOB = 'illustration.continuity'
export const ANALYSIS_LANE = 'illustration.analysis'

const PlanPayload = z.object({
    messageId: z.uuid(),
    count: IllustrationCountSchema.optional(),
})
const RenderPayload = z.object({ illustrationId: z.uuid() })
const TrackPayload = z.object({ messageId: z.uuid() })

const SLOT_TEXT_LIMIT = 1_500
const CONTEXT_TEXT_LIMIT = 2_000
const ANALYSIS_TIMEOUT_MS = 180_000
// Providers report these as transient; anything else will fail the same way again.
const RETRYABLE_PROVIDER_CODES = new Set(['rate_limited', 'provider_unreachable'])

interface Analyzed {
    message: Message
    plan: AnalysisPlan
    actorsByRef: Map<string, IllustrationActor>
    definitions: IllustrationStateDefinition[]
    /** The state after this response. */
    next: IllustrationState
    styleId: string | null
    warnings: string[]
}

/** Turns a finished response into illustration slots, then renders each slot. */
export class IllustrationPipeline {
    constructor(
        private readonly store: Store,
        private readonly providers: ProviderService,
        private readonly illustrations: IllustrationService,
        private readonly continuity: ContinuityService,
        private readonly jobs: JobRunner,
        private readonly assets: AssetStore,
        private readonly events: RuntimeEventHub,
        private readonly log: Logger,
    ) {
        jobs.define({
            kind: PLAN_JOB,
            lane: ANALYSIS_LANE,
            payload: PlanPayload,
            maxAttempts: 3,
            run: (context) => this.plan(context),
        })
        jobs.define({
            kind: TRACK_JOB,
            lane: ANALYSIS_LANE,
            payload: TrackPayload,
            maxAttempts: 3,
            run: (context) => this.track(context),
        })
        jobs.define({
            kind: RENDER_JOB,
            lane: NOVELAI_LANE,
            payload: RenderPayload,
            maxAttempts: 4,
            run: (context) => this.render(context),
        })
    }

    list(conversationId: string): MessageIllustration[] {
        return this.store.messageIllustration.listViews(conversationId)
    }

    /** Queues a fresh plan for an assistant message, replacing one already queued. */
    request(conversationId: string, messageId: string, count?: IllustrationCount): BackgroundJob {
        const message = this.store.message.get(messageId)
        if (!message || message.conversationId !== conversationId) {
            throw new NotFoundError('Message not found')
        }
        if (message.role !== 'assistant') {
            throw new ValidationError('Only assistant messages can be illustrated')
        }
        this.jobs.cancel({ messageId, kind: PLAN_JOB })
        return this.jobs.enqueue(PLAN_JOB, { messageId, count }, { conversationId, messageId })
    }

    retry(illustrationId: string): BackgroundJob {
        const illustration = this.store.messageIllustration.get(illustrationId)
        if (!illustration) throw new NotFoundError('Illustration not found')
        if (illustration.status !== 'failed') {
            throw new ValidationError('Only a failed illustration can be retried')
        }
        this.store.messageIllustration.setStatus(illustrationId, 'pending')
        this.publish(illustrationId)
        return this.enqueueRender(
            illustration.conversationId,
            illustration.messageId,
            illustrationId,
        )
    }

    handleCompleted(event: GenerationCompletedEvent): void {
        // Continuing extends a reply whose illustrations were already planned.
        if (event.mode === 'continue') return
        const settings = this.store.conversationIllustrationSettings.get(event.conversationId)
        if (!settings?.enabled) return
        if (settings.mode === 'auto') {
            this.request(event.conversationId, event.messageId)
            return
        }
        if (this.store.illustrationSettings.get().continuityTracking !== 'every-message') return
        this.jobs.cancel({ messageId: event.messageId, kind: TRACK_JOB })
        this.jobs.enqueue(
            TRACK_JOB,
            { messageId: event.messageId },
            { conversationId: event.conversationId, messageId: event.messageId },
        )
    }

    /** Old output keeps its illustrations for history switching; unfinished ones stop. */
    handleRegenerating(messageId: string): void {
        this.jobs.cancel({ messageId })
        for (const id of this.store.messageIllustration.failUnfinished(
            messageId,
            'Cancelled because the response was regenerated',
        )) {
            this.publish(id)
        }
    }

    /** Cancels jobs whose message is gone; the rows themselves cascade with the message. */
    handleMessagesRemoved(conversationId: string): void {
        for (const job of this.jobs.listActive({ conversationId })) {
            if (job.messageId && !this.store.message.get(job.messageId)) {
                this.jobs.cancel({ id: job.id })
            }
        }
    }

    private async plan({ payload, signal }: JobContext<z.infer<typeof PlanPayload>>) {
        const analyzed = await this.analyze(payload.messageId, { count: payload.count }, signal)
        if ('skipped' in analyzed) return analyzed
        const { message, plan, next } = analyzed
        const created = this.store.transaction(() => {
            const current = this.currentText(message)
            if (!current) return null
            const run = this.store.generation.currentRun(current.id, current.content)
            this.continuity.save({
                conversationId: current.conversationId,
                messageId: current.id,
                generationRunId: run?.id ?? null,
                state: next,
                source: 'analysis',
            })
            return this.applyPlan(current, run?.id ?? null, plan, analyzed)
        })
        if (!created) return { skipped: 'message-deleted' }

        this.continuity.publish(message.conversationId)
        this.events.publish({
            type: 'runtime.event',
            name: 'messages.changed',
            data: { conversationId: message.conversationId, messageIds: [message.id] },
        })
        for (const id of created) {
            this.publish(id)
            this.enqueueRender(message.conversationId, message.id, id)
        }
        return { planned: created.length, warnings: analyzed.warnings }
    }

    /** The light analysis of `every-message` tracking: continuity only, no illustrations. */
    private async track({ payload, signal }: JobContext<z.infer<typeof TrackPayload>>) {
        const analyzed = await this.analyze(payload.messageId, null, signal)
        if ('skipped' in analyzed) return analyzed
        const { message, next } = analyzed
        const saved = this.store.transaction(() => {
            const current = this.currentText(message)
            if (!current) return false
            this.continuity.save({
                conversationId: current.conversationId,
                messageId: current.id,
                generationRunId:
                    this.store.generation.currentRun(current.id, current.content)?.id ?? null,
                state: next,
                source: 'analysis',
            })
            return true
        })
        if (!saved) return { skipped: 'message-deleted' }
        this.continuity.publish(message.conversationId)
        return { warnings: analyzed.warnings }
    }

    /** Re-reads the message inside the write; its text must not have moved under the analysis. */
    private currentText(message: { id: string; content: string }) {
        const current = this.store.message.get(message.id)
        if (!current) return null
        if (current.content !== message.content) {
            throw new RetryableJobError('The message changed while it was being analyzed', {
                retryAfterMs: 1_000,
            })
        }
        return current
    }

    /** Asks the analysis AI about one response and applies its continuity to the prior state. */
    private async analyze(
        messageId: string,
        illustrate: { count?: IllustrationCount } | null,
        signal: AbortSignal,
    ): Promise<Analyzed | { skipped: string }> {
        const message = this.store.message.get(messageId)
        if (!message) return { skipped: 'message-deleted' }
        if (message.status === 'streaming') {
            throw new RetryableJobError('The response is still streaming', { retryAfterMs: 5_000 })
        }
        const conversation = this.store.conversation.get(message.conversationId)
        if (!conversation) return { skipped: 'conversation-deleted' }
        const paragraphs = splitParagraphs(message.content)
        if (!paragraphs.length) return { skipped: 'empty-message' }

        const global = this.store.illustrationSettings.get()
        const local = this.store.conversationIllustrationSettings.get(conversation.id)
        const cast = this.continuity.cast(conversation)
        const actors = cast.actors.filter((actor) => actor.enabled)
        const refs = actorRefs(actors.map((actor) => actor.name))
        const actorsByRef = new Map(actors.map((actor, index) => [refs[index]!, actor]))
        const refOf = new Map(actors.map((actor, index) => [actor.id, refs[index]!]))
        const snapshot = this.continuity.snapshotAt(conversation.id, message.position)
        const previous = snapshot ? this.continuity.prune(snapshot.state, cast) : null
        const history = this.store.message
            .list(conversation.id)
            .filter((item) => item.position < message.position && item.role !== 'system')
            .slice(-global.contextMessageCount)

        const input: AnalysisInput = {
            roster: actors.map((actor, index) => {
                const outfits = actor.outfits.filter((outfit) => outfit.enabled)
                return {
                    ref: refs[index]!,
                    name: actor.name,
                    keys: actor.keys,
                    outfits: outfits.map((outfit) => outfit.name),
                    defaultOutfit:
                        outfits.find((outfit) => outfit.isDefault && !outfit.conversationId)
                            ?.name ?? null,
                    isUser: actor.personaId !== null,
                }
            }),
            continuity: {
                present: (previous?.present ?? []).flatMap((id) => refOf.get(id) ?? []),
                outfits: Object.fromEntries(
                    actors.flatMap((actor) => {
                        const outfit = this.continuity.outfitOf(actor, previous)
                        return outfit ? [[refOf.get(actor.id)!, outfit.name]] : []
                    }),
                ),
                locked: actors
                    .filter((actor) => previous?.outfits[actor.id]?.locked)
                    .map((actor) => refOf.get(actor.id)!),
                states: Object.fromEntries(
                    Object.entries(previous?.states ?? {}).flatMap(([actorId, values]) => {
                        const ref = refOf.get(actorId)
                        return ref
                            ? [
                                  [
                                      ref,
                                      Object.fromEntries(
                                          Object.entries(values).map(([key, entry]) => [
                                              key,
                                              entry.value,
                                          ]),
                                      ),
                                  ],
                              ]
                            : []
                    }),
                ),
            },
            stateDefinitions: cast.definitions.map((definition) => ({
                key: definition.key,
                label: definition.label,
                kind: definition.kind,
                instruction: definition.instruction,
                ...(definition.kind === 'choice'
                    ? { options: definition.options.map((option) => option.value) }
                    : {}),
            })),
            context: history.map((item) => ({
                role: item.role === 'user' ? 'user' : 'assistant',
                text: plainText(item.content, CONTEXT_TEXT_LIMIT),
            })),
            slots: paragraphs.map((paragraph) => ({
                slot: paragraph.index,
                text: plainText(paragraph.text, SLOT_TEXT_LIMIT),
            })),
            count: illustrate ? (illustrate.count ?? local?.count ?? global.defaultCount) : null,
            sizes: global.sizePresets.map((size) => size.name),
            sceneDirection: local?.sceneDirection ?? '',
        }

        const runtime = await this.analysisRuntime(
            conversation.id,
            local?.analysisModelPresetId ?? global.analysisModelPresetId,
        )
        const plan = await runAnalysis(
            (messages) => this.complete(runtime, messages, signal),
            global.analysisInstruction.trim() || DEFAULT_ANALYSIS_INSTRUCTION,
            input,
        )
        if (signal.aborted) return { skipped: 'cancelled' }

        const resolved = this.continuity.resolveDelta(
            conversation.id,
            plan.continuity,
            actorsByRef,
            previous,
        )
        const applied = applyContinuity(
            previous,
            resolved.delta,
            cast.definitions,
            this.continuity.turnAt(conversation.id, message.position),
        )
        const warnings = [...plan.warnings, ...resolved.warnings, ...applied.warnings]
        if (warnings.length) {
            this.log.info(
                { event: 'illustration.analysis_warnings', messageId: message.id, warnings },
                'Illustration analysis adjusted',
            )
        }
        return {
            message,
            plan,
            actorsByRef,
            definitions: cast.definitions,
            next: applied.state,
            styleId: local?.styleId ?? global.defaultStyleId,
            warnings,
        }
    }

    /** Replaces the message's current illustrations with the new plan in one transaction. */
    private applyPlan(
        message: { id: string; conversationId: string; content: string },
        generationRunId: string | null,
        plan: AnalysisPlan,
        analyzed: Analyzed,
    ): string[] {
        const global = this.store.illustrationSettings.get()
        const style = analyzed.styleId ? this.store.illustrationStyle.get(analyzed.styleId) : null

        const previous = new Set(illustrationTokenIds(message.content))
        const replaced = this.store.messageIllustration
            .listForMessage(message.id)
            .filter((row) => previous.has(row.id))
            .map((row) => row.id)
        this.jobs.cancel({ messageId: message.id, kind: RENDER_JOB })
        this.store.messageIllustration.deleteMany(replaced)
        const base = removeTokens(message.content, new Set(replaced))

        const rows: NewMessageIllustration[] = plan.illustrations.map((planned) => {
            const composed = composePrompt({
                fixedPositive: global.fixedPositive,
                fixedNegative: global.fixedNegative,
                style,
                scene: planned.scene,
                characters: planned.characters.flatMap((character) => {
                    const actor = analyzed.actorsByRef.get(character.ref)
                    if (!actor) return []
                    return [
                        {
                            actor,
                            tags: character.tags,
                            outfit: this.continuity.outfitOf(actor, analyzed.next),
                            state: stateTags(analyzed.next.states[actor.id], analyzed.definitions),
                        },
                    ]
                }),
            })
            const size = global.sizePresets.find((preset) => preset.name === planned.size) ?? null
            return {
                id: crypto.randomUUID(),
                conversationId: message.conversationId,
                messageId: message.id,
                generationRunId,
                slotIndex: planned.slot,
                plan: planned.raw,
                positive: composed.positive,
                negative: composed.negative,
                characters: composed.characters,
                params: resolveImageParams(global.defaultImageParams, style?.params ?? null, size),
            }
        })
        const content = insertTokens(
            base,
            rows.map((row) => ({ paragraph: row.slotIndex, id: row.id })),
        )
        this.store.messageIllustration.createMany(rows)
        this.store.message.update(message.id, { content })
        if (generationRunId) this.store.generation.setProcessedOutput(generationRunId, content)
        return rows.map((row) => row.id)
    }

    private async render({ payload, signal, job }: JobContext<z.infer<typeof RenderPayload>>) {
        const id = payload.illustrationId
        const illustration = this.store.messageIllustration.get(id)
        if (!illustration) return { skipped: 'illustration-deleted' }
        this.store.messageIllustration.setStatus(id, 'rendering')
        this.publish(id)
        try {
            const result = await this.illustrations.generate(
                {
                    positive: illustration.positive,
                    negative: illustration.negative,
                    characters: illustration.characters,
                    params: illustration.params,
                },
                signal,
            )
            const asset = await this.assets.put(result.image, result.mimeType)
            if (!this.store.messageIllustration.get(id)) return { skipped: 'illustration-deleted' }
            this.store.messageIllustration.addRevision(id, {
                assetId: asset.id,
                seed: result.seed,
                request: result.request,
            })
            this.publish(id)
            return { assetId: asset.id, seed: result.seed }
        } catch (error) {
            if (signal.aborted) throw error
            const message = error instanceof Error ? error.message : String(error)
            if (
                error instanceof NovelAIImageError &&
                error.retryable &&
                job.attempts < job.maxAttempts
            ) {
                this.store.messageIllustration.setStatus(id, 'pending', message)
                this.publish(id)
                throw new RetryableJobError(message, {
                    retryAfterMs: error.retryAfterMs,
                    code: error.reason,
                    cause: error,
                })
            }
            this.store.messageIllustration.setStatus(id, 'failed', message)
            this.publish(id)
            throw error
        }
    }

    private enqueueRender(conversationId: string, messageId: string, illustrationId: string) {
        return this.jobs.enqueue(RENDER_JOB, { illustrationId }, { conversationId, messageId })
    }

    private async analysisRuntime(conversationId: string, presetId: string | null) {
        try {
            return presetId
                ? await this.providers.requireRuntimeForModelPreset(presetId)
                : await this.providers.requireRuntimeForConversation(conversationId, true)
        } catch (error) {
            throw retryableIfTransient(error)
        }
    }

    private async complete(
        runtime: Awaited<ReturnType<ProviderService['requireRuntimeForModelPreset']>>,
        messages: CompiledMessage[],
        signal: AbortSignal,
    ): Promise<string> {
        let text = ''
        try {
            for await (const chunk of providerFor(runtime).streamChat(runtime, {
                messages,
                parameters: { temperature: 0.4, maxContextTokens: 32_768, maxOutputTokens: 4_096 },
                signal: AbortSignal.any([signal, AbortSignal.timeout(ANALYSIS_TIMEOUT_MS)]),
            })) {
                text += chunk.delta
            }
        } catch (error) {
            if (signal.aborted) throw error
            throw retryableIfTransient(error)
        }
        return text
    }

    private publish(illustrationId: string): void {
        const view = this.store.messageIllustration.view(illustrationId)
        if (!view) return
        this.events.publish({ type: 'runtime.event', name: 'illustration.updated', data: view })
    }
}

function retryableIfTransient(error: unknown): unknown {
    if (error instanceof AppError && RETRYABLE_PROVIDER_CODES.has(error.code)) {
        return new RetryableJobError(error.message, { code: error.code, cause: error })
    }
    return error
}

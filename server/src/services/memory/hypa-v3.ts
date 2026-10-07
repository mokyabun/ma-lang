import type {
    LongTermMemoryMetrics,
    LongTermMemorySettings,
    LongTermMemoryState,
    Message,
} from '@malang/shared'
import type { Logger } from 'pino'

import type { MemorySummaryRecord, SparseVector, Store } from '@/db'
import { providerFor } from '@/services/providers'
import type { ChatTokenizer } from '@/services/tokenizer'

import type { ProviderService } from '../app/providers'

const MEMORY_TAG = 'Past Events Summary'
const SUMMARY_SEPARATOR = '\n\n'
const DEFAULT_SUMMARIZATION_PROMPT =
    'Summarize the ongoing roleplay or conversation. Preserve concrete events, decisions, relationships, promises, names, locations, possessions, and unresolved goals. Remove repetition and commentary. Write a compact factual summary.'

export interface HypaMemoryPrompt {
    enabled: boolean
    content: string
    summarizedMessageIds: string[]
    selectedSummaryIds: string[]
    summaryCount: number
    warnings: string[]
}

export class HypaMemoryV3Service {
    constructor(
        private readonly store: Store,
        private readonly providers: ProviderService,
        private readonly log: Logger,
    ) {}

    state(conversationId: string): LongTermMemoryState {
        return {
            settings: this.store.memorySettings.get(conversationId),
            summaries: this.store.memorySummary.list(conversationId),
            metrics: this.store.memoryMetrics.get(conversationId),
        }
    }

    updateSettings(
        conversationId: string,
        patch: Partial<LongTermMemorySettings>,
    ): LongTermMemoryState {
        this.store.memorySettings.update(conversationId, patch)
        return this.state(conversationId)
    }

    updateSummary(
        conversationId: string,
        summaryId: string,
        patch: { text?: string; isImportant?: boolean },
    ) {
        return this.store.memorySummary.update(conversationId, summaryId, {
            ...patch,
            ...(patch.text === undefined ? {} : { vector: featureVector(patch.text) }),
        })
    }

    deleteSummary(conversationId: string, summaryId: string): boolean {
        const deleted = this.store.memorySummary.delete(conversationId, summaryId)
        if (deleted) {
            const metrics = this.store.memoryMetrics.get(conversationId)
            this.store.memoryMetrics.set(conversationId, {
                importantSummaryIds: metrics.importantSummaryIds.filter((id) => id !== summaryId),
                recentSummaryIds: metrics.recentSummaryIds.filter((id) => id !== summaryId),
                similarSummaryIds: metrics.similarSummaryIds.filter((id) => id !== summaryId),
                randomSummaryIds: metrics.randomSummaryIds.filter((id) => id !== summaryId),
            })
        }
        return deleted
    }

    clear(conversationId: string): number {
        const deleted = this.store.memorySummary.clear(conversationId)
        this.store.memoryMetrics.set(conversationId, {
            importantSummaryIds: [],
            recentSummaryIds: [],
            similarSummaryIds: [],
            randomSummaryIds: [],
        })
        return deleted
    }

    /** Recall existing memory without causing provider calls or database writes. */
    recall(
        conversationId: string,
        messages: Message[],
        maxContextTokens: number,
        tokenizer: ChatTokenizer,
    ): HypaMemoryPrompt {
        const settings = this.store.memorySettings.get(conversationId)
        if (!settings.enabled) return emptyPrompt()
        return this.select(conversationId, messages, maxContextTokens, settings, tokenizer, false)
    }

    /** Summarize overflowing history, persist it, then select memories for this generation. */
    async prepare(
        conversationId: string,
        messages: Message[],
        maxContextTokens: number,
        tokenizer: ChatTokenizer,
        forceSummarizeMessageIds: string[] = [],
    ): Promise<HypaMemoryPrompt> {
        const settings = this.store.memorySettings.get(conversationId)
        if (!settings.enabled) return emptyPrompt()

        this.reconcileOrphans(conversationId, messages, settings)
        let summaries = this.store.memorySummary.listRecords(conversationId)
        const summarizedIds = new Set(summaries.flatMap((summary) => summary.sourceMessageIds))
        const candidates = messages.filter(
            (message) =>
                message.status !== 'failed' &&
                message.content.trim() &&
                !summarizedIds.has(message.id),
        )
        const protectedIds = new Set(
            candidates.slice(-settings.queryMessageCount).map((message) => message.id),
        )
        const eligible = candidates.filter((message) => !protectedIds.has(message.id))
        const targetTokens = Math.floor(
            maxContextTokens * (1 - settings.memoryTokensRatio - settings.extraSummarizationRatio),
        )
        const messageTokens = (batch: Message[]) =>
            batch.reduce((sum, message) => sum + tokenizer.tokenizeChat(message), 0)
        let activeTokens = messageTokens(candidates)
        const forcedIds = new Set(forceSummarizeMessageIds)

        while (
            eligible.length >= 2 &&
            (eligible.some((message) => forcedIds.has(message.id)) || activeTokens > targetTokens)
        ) {
            const batch = eligible.splice(0, settings.maxMessagesPerSummary)
            if (batch.length < 2) break
            const summaryText = await this.summarize(conversationId, batch, settings)
            this.store.memorySummary.create({
                conversationId,
                text: summaryText,
                sourceMessageIds: batch.map((message) => message.id),
                vector: featureVector(summaryText),
            })
            activeTokens -= messageTokens(batch)
            for (const message of batch) forcedIds.delete(message.id)
            this.log.info(
                {
                    event: 'hypa_memory.summary_created',
                    conversationId,
                    sourceMessageCount: batch.length,
                },
                'Created long-term memory summary',
            )
        }

        summaries = this.store.memorySummary.listRecords(conversationId)
        return this.select(
            conversationId,
            messages,
            maxContextTokens,
            settings,
            tokenizer,
            true,
            summaries,
        )
    }

    private reconcileOrphans(
        conversationId: string,
        messages: Message[],
        settings: LongTermMemorySettings,
    ): void {
        if (settings.preserveOrphanedMemory) return
        const currentIds = new Set(messages.map((message) => message.id))
        for (const summary of this.store.memorySummary.listRecords(conversationId)) {
            if (summary.sourceMessageIds.some((id) => !currentIds.has(id))) {
                this.deleteSummary(conversationId, summary.id)
            }
        }
    }

    private select(
        conversationId: string,
        messages: Message[],
        maxContextTokens: number,
        settings: LongTermMemorySettings,
        tokenizer: ChatTokenizer,
        persistMetrics: boolean,
        summaryRecords = this.store.memorySummary.listRecords(conversationId),
    ): HypaMemoryPrompt {
        if (!summaryRecords.length) return emptyPrompt()
        const query = messages
            .filter((message) => message.status !== 'failed' && message.content.trim())
            .slice(-settings.queryMessageCount)
            .map((message) => message.content)
            .join('\n\n')
        const selection = selectMemorySummaries(
            summaryRecords,
            query,
            Math.max(0, Math.floor(maxContextTokens * settings.memoryTokensRatio) - 12),
            settings,
            tokenizer,
        )
        if (persistMetrics) this.store.memoryMetrics.set(conversationId, selection.metrics)
        const summarizedMessageIds = [
            ...new Set(summaryRecords.flatMap((summary) => summary.sourceMessageIds)),
        ]
        return {
            enabled: true,
            content: selection.summaries.length
                ? `<${MEMORY_TAG}>\n${selection.summaries.map((item) => item.text).join(SUMMARY_SEPARATOR)}\n</${MEMORY_TAG}>`
                : '',
            summarizedMessageIds,
            selectedSummaryIds: selection.summaries.map((summary) => summary.id),
            summaryCount: summaryRecords.length,
            warnings: [],
        }
    }

    private async summarize(
        conversationId: string,
        messages: Message[],
        settings: LongTermMemorySettings,
    ): Promise<string> {
        const runtime = await this.providers.requireRuntimeForConversation(conversationId, true)
        const transcript = messages
            .map((message) => `${message.role}: ${sanitize(message.content)}`)
            .join('\n')
        const instruction = settings.summarizationPrompt.trim() || DEFAULT_SUMMARIZATION_PROMPT
        const promptMessages = instruction.includes('{{slot}}')
            ? [{ role: 'user' as const, content: instruction.replaceAll('{{slot}}', transcript) }]
            : [
                  { role: 'system' as const, content: instruction },
                  { role: 'user' as const, content: transcript },
              ]
        let result = ''
        for await (const chunk of providerFor(runtime).streamChat(runtime, {
            messages: promptMessages,
            parameters: {
                temperature: 0,
                maxContextTokens: 32_768,
                maxOutputTokens: 2_048,
            },
            signal: AbortSignal.timeout(120_000),
        })) {
            result += chunk.delta
        }
        result = result
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<Thoughts>[\s\S]*?<\/Thoughts>/gi, '')
            .trim()
        if (!result) throw new Error('[HypaV3] The auxiliary model returned an empty summary')
        return result
    }
}

export function featureVector(text: string): SparseVector {
    const normalized = text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
    if (!normalized) return {}
    const vector: SparseVector = {}
    const add = (feature: string) => {
        const bucket = hashBucket(feature)
        vector[bucket] = (vector[bucket] || 0) + 1
    }
    for (const token of normalized.match(/[\p{L}\p{N}]+/gu) || []) add(`w:${token}`)
    const compact = normalized.replace(/\s/g, '')
    for (let width = 2; width <= 3; width += 1) {
        for (let index = 0; index <= compact.length - width; index += 1) {
            add(`c:${compact.slice(index, index + width)}`)
        }
    }
    const norm = Math.sqrt(Object.values(vector).reduce((sum, value) => sum + value * value, 0))
    if (norm) for (const key of Object.keys(vector)) vector[key] = (vector[key] || 0) / norm
    return vector
}

export function cosineSimilarity(left: SparseVector, right: SparseVector): number {
    const [small, large] =
        Object.keys(left).length <= Object.keys(right).length ? [left, right] : [right, left]
    return Object.entries(small).reduce(
        (score, [key, value]) => score + value * (large[key] || 0),
        0,
    )
}

export function selectMemorySummaries(
    summaries: MemorySummaryRecord[],
    query: string,
    tokenBudget: number,
    settings: Pick<LongTermMemorySettings, 'recentMemoryRatio' | 'similarMemoryRatio'> & {
        summaryChunkSeparator?: string
    },
    tokenizer: ChatTokenizer,
): { summaries: MemorySummaryRecord[]; metrics: LongTermMemoryMetrics } {
    const selected: MemorySummaryRecord[] = []
    const selectedIds = new Set<string>()
    let available = tokenBudget
    const take = (summary: MemorySummaryRecord, budget: number) => {
        // PocketRisu prices each summary as its own system turn, separator included.
        const tokens = tokenizer.tokenizeChat({ content: summary.text + SUMMARY_SEPARATOR })
        if (tokens > budget || selectedIds.has(summary.id)) return 0
        selected.push(summary)
        selectedIds.add(summary.id)
        return tokens
    }

    const importantSummaryIds: string[] = []
    for (const summary of summaries.filter((item) => item.isImportant)) {
        const used = take(summary, available)
        if (used) {
            importantSummaryIds.push(summary.id)
            available -= used
        }
    }

    const baseAvailable = available
    const recentBudget = Math.floor(baseAvailable * settings.recentMemoryRatio)
    let recentUsed = 0
    const recentSummaryIds: string[] = []
    for (const summary of [...summaries].reverse()) {
        const used = take(summary, recentBudget - recentUsed)
        if (used) {
            recentUsed += used
            recentSummaryIds.push(summary.id)
        }
    }

    const randomRatio = Math.max(0, 1 - settings.recentMemoryRatio - settings.similarMemoryRatio)
    let similarBudget = Math.floor(baseAvailable * settings.similarMemoryRatio)
    if (randomRatio === 0) similarBudget += recentBudget - recentUsed
    let similarUsed = 0
    const similarSummaryIds: string[] = []
    const queryVector = featureVector(query)
    const ranked = summaries
        .filter((summary) => !selectedIds.has(summary.id))
        .map((summary) => {
            const chunks = splitSummaryText(summary.text, settings.summaryChunkSeparator)
            const score =
                chunks.length === 1
                    ? cosineSimilarity(queryVector, summary.vector)
                    : Math.max(
                          ...chunks.map((chunk) =>
                              cosineSimilarity(queryVector, featureVector(chunk)),
                          ),
                      )
            return [summary, score] as const
        })
        .sort((left, right) => right[1] - left[1])
    for (const [summary] of ranked) {
        const used = take(summary, similarBudget - similarUsed)
        if (used) {
            similarUsed += used
            similarSummaryIds.push(summary.id)
        }
    }

    const randomBudget =
        randomRatio > 0
            ? Math.floor(baseAvailable * randomRatio) +
              (recentBudget - recentUsed) +
              (similarBudget - similarUsed)
            : 0
    let randomUsed = 0
    const randomSummaryIds: string[] = []
    for (const summary of summaries
        .filter((item) => !selectedIds.has(item.id))
        .sort((left, right) => stableOrder(left.id) - stableOrder(right.id))) {
        const used = take(summary, randomBudget - randomUsed)
        if (used) {
            randomUsed += used
            randomSummaryIds.push(summary.id)
        }
    }

    selected.sort((left, right) => summaries.indexOf(left) - summaries.indexOf(right))
    return {
        summaries: selected,
        metrics: {
            importantSummaryIds,
            recentSummaryIds,
            similarSummaryIds,
            randomSummaryIds,
        },
    }
}

function sanitize(text: string): string {
    return text.replace(/\{\{inlay::[^}]+}}/g, '[Image]')
}

function splitSummaryText(text: string, separator = '\\n\\n'): string[] {
    try {
        const literal = separator.match(/^\/(.+)\/([dgimsuvy]*)$/)
        const pattern = literal ? new RegExp(literal[1] || '', literal[2]) : new RegExp(separator)
        const chunks = text
            .split(pattern)
            .map((chunk) => chunk.trim())
            .filter(Boolean)
        return chunks.length ? chunks : [text]
    } catch {
        return text
            .split(/\n\n+/)
            .map((chunk) => chunk.trim())
            .filter(Boolean)
    }
}

function hashBucket(value: string): string {
    return String(fnv1a(value) % 512)
}

function stableOrder(value: string): number {
    return fnv1a(value)
}

function fnv1a(value: string): number {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

function emptyPrompt(): HypaMemoryPrompt {
    return {
        enabled: false,
        content: '',
        summarizedMessageIds: [],
        selectedSummaryIds: [],
        summaryCount: 0,
        warnings: [],
    }
}

import type {
    BackgroundJob,
    IllustrationCount,
    MessageIllustration,
    RuntimeEvent,
} from '@malang/shared'
import { atom } from 'jotai'

import { api } from '@/lib/api'
import type { IllustrationView } from '@/lib/message-images'

import { selectedConversationIdAtom, workspaceErrorAtom } from '../atom'
import { loadConversationAtom } from './atom'

const PLAN_JOB = 'illustration.plan'

export interface MessagePlanState {
    status: 'running' | 'failed'
    jobId: string
    error: string | null
}

const illustrationsAtom = atom<Record<string, MessageIllustration>>({})
/** Plan jobs per message: in progress, or the last one that failed. */
export const messagePlansAtom = atom<Record<string, MessagePlanState>>({})

export const illustrationViewsAtom = atom(
    (get) =>
        new Map(
            Object.values(get(illustrationsAtom)).map((illustration) => [
                illustration.id,
                illustrationView(illustration),
            ]),
        ),
)

export function illustrationView(illustration: MessageIllustration): IllustrationView {
    if (illustration.status === 'complete' && illustration.assetId) {
        return { status: 'complete', assetId: illustration.assetId }
    }
    if (illustration.status === 'failed') return { status: 'failed', assetId: null }
    return { status: 'pending', assetId: null }
}

function planState(job: BackgroundJob): MessagePlanState | null {
    if (job.status === 'queued' || job.status === 'running') {
        return { status: 'running', jobId: job.id, error: null }
    }
    if (job.status === 'failed') {
        return { status: 'failed', jobId: job.id, error: job.error?.message ?? null }
    }
    return null
}

export const loadIllustrationsAtom = atom(null, async (get, set, conversationId: string) => {
    try {
        const [{ illustrations }, { jobs }] = await Promise.all([
            api.conversationIllustrations(conversationId),
            api.activeJobs({ conversationId }),
        ])
        if (get(selectedConversationIdAtom) !== conversationId) return
        set(
            illustrationsAtom,
            Object.fromEntries(
                illustrations.map((illustration) => [illustration.id, illustration]),
            ),
        )
        set(
            messagePlansAtom,
            Object.fromEntries(
                jobs.flatMap((job) => {
                    const state = job.kind === PLAN_JOB && job.messageId ? planState(job) : null
                    return state ? [[job.messageId!, state]] : []
                }),
            ),
        )
    } catch {
        // Illustrations are optional decoration; the chat stays usable without them.
    }
})

export const applyIllustrationEventAtom = atom(null, (get, set, event: RuntimeEvent) => {
    const conversationId = get(selectedConversationIdAtom)
    if (event.name === 'illustration.updated') {
        if (event.data.conversationId !== conversationId) return
        set(illustrationsAtom, (current) => ({ ...current, [event.data.id]: event.data }))
        return
    }
    if (event.name === 'messages.changed') {
        if (event.data.conversationId === conversationId)
            void set(loadConversationAtom, conversationId)
        return
    }
    if (event.name !== 'job.updated') return
    const job = event.data
    if (job.kind !== PLAN_JOB || !job.messageId || job.conversationId !== conversationId) return
    const messageId = job.messageId
    set(messagePlansAtom, (current) => {
        const next = { ...current }
        const state = planState(job)
        if (state) next[messageId] = state
        // A late update from a replaced job must not clear its successor.
        else if (next[messageId]?.jobId === job.id) delete next[messageId]
        return next
    })
})

export const requestIllustrationAtom = atom(
    null,
    async (
        _get,
        set,
        input: { conversationId: string; messageId: string; count?: IllustrationCount },
    ) => {
        try {
            const job = await api.illustrateMessage(
                input.conversationId,
                input.messageId,
                input.count,
            )
            set(messagePlansAtom, (current) => ({
                ...current,
                [input.messageId]: { status: 'running', jobId: job.id, error: null },
            }))
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '삽화 생성을 요청하지 못했습니다.',
            )
        }
    },
)

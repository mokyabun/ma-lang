import { describe, expect, test } from 'bun:test'

import type { BackgroundJob, MessageIllustration, RuntimeEvent } from '@malang/shared'
import { createStore } from 'jotai'

import { selectedConversationIdAtom } from '@/lib/store'

import {
    applyIllustrationEventAtom,
    illustrationView,
    illustrationViewsAtom,
    messagePlansAtom,
} from './illustration-atom'

const conversationId = '11111111-1111-4111-8111-111111111111'
const messageId = '22222222-2222-4222-8222-222222222222'

const illustration = (overrides: Partial<MessageIllustration> = {}): MessageIllustration => ({
    id: '33333333-3333-4333-8333-333333333333',
    conversationId,
    messageId,
    generationRunId: null,
    slotIndex: 1,
    status: 'pending',
    assetId: null,
    width: 832,
    height: 1216,
    error: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
})

const planJob = (id: string, status: BackgroundJob['status']): BackgroundJob => ({
    id,
    kind: 'illustration.plan',
    status,
    attempts: 1,
    maxAttempts: 3,
    runAfter: '',
    conversationId,
    messageId,
    error: status === 'failed' ? { message: 'bad JSON' } : null,
    createdAt: '',
    updatedAt: '',
    completedAt: null,
})

describe('illustration chat state', () => {
    test('maps rendering states onto what a message shows', () => {
        expect(illustrationView(illustration({ status: 'rendering' }))).toEqual({
            status: 'pending',
            assetId: null,
        })
        expect(illustrationView(illustration({ status: 'complete', assetId: 'asset' }))).toEqual({
            status: 'complete',
            assetId: 'asset',
        })
        expect(illustrationView(illustration({ status: 'failed' })).status).toBe('failed')
    })

    test('applies illustration and plan events for the open conversation only', () => {
        const store = createStore()
        store.set(selectedConversationIdAtom, conversationId)
        const apply = (event: RuntimeEvent) => store.set(applyIllustrationEventAtom, event)

        apply({ type: 'runtime.event', name: 'illustration.updated', data: illustration() })
        apply({
            type: 'runtime.event',
            name: 'illustration.updated',
            data: illustration({
                id: '44444444-4444-4444-8444-444444444444',
                conversationId: messageId,
            }),
        })
        expect([...store.get(illustrationViewsAtom).keys()]).toEqual([illustration().id])

        apply({ type: 'runtime.event', name: 'job.updated', data: planJob('job-1', 'running') })
        expect(store.get(messagePlansAtom)[messageId]).toMatchObject({ status: 'running' })
        apply({ type: 'runtime.event', name: 'job.updated', data: planJob('job-2', 'queued') })
        // The replaced job finishing late leaves its successor in place.
        apply({ type: 'runtime.event', name: 'job.updated', data: planJob('job-1', 'cancelled') })
        expect(store.get(messagePlansAtom)[messageId]).toMatchObject({ jobId: 'job-2' })
        apply({ type: 'runtime.event', name: 'job.updated', data: planJob('job-2', 'failed') })
        expect(store.get(messagePlansAtom)[messageId]).toEqual({
            status: 'failed',
            jobId: 'job-2',
            error: 'bad JSON',
        })
    })
})

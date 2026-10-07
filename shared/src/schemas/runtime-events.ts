import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'
import { MessageIllustrationSchema } from './illustrations'

export const BackgroundJobStatusSchema = z.enum([
    'queued',
    'running',
    'complete',
    'failed',
    'cancelled',
])

export const BackgroundJobErrorSchema = z.object({
    message: z.string(),
    code: z.string().optional(),
})

export const BackgroundJobSchema = z.object({
    id: IdSchema,
    kind: z.string(),
    status: BackgroundJobStatusSchema,
    attempts: z.int(),
    maxAttempts: z.int(),
    runAfter: TimestampSchema,
    conversationId: IdSchema.nullable(),
    messageId: IdSchema.nullable(),
    error: BackgroundJobErrorSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    completedAt: TimestampSchema.nullable(),
})

/** Broadcast to every open tab; a tab that missed one re-reads state over REST. */
export const RuntimeEventSchema = z.discriminatedUnion('name', [
    z.object({
        type: z.literal('runtime.event'),
        name: z.literal('job.updated'),
        data: BackgroundJobSchema,
    }),
    z.object({
        type: z.literal('runtime.event'),
        name: z.literal('illustration.updated'),
        data: MessageIllustrationSchema,
    }),
    z.object({
        type: z.literal('runtime.event'),
        /** Message text changed outside a generation, e.g. illustration tokens were inserted. */
        name: z.literal('messages.changed'),
        data: z.object({ conversationId: IdSchema, messageIds: z.array(IdSchema) }),
    }),
    z.object({
        type: z.literal('runtime.event'),
        name: z.literal('continuity.updated'),
        data: z.object({ conversationId: IdSchema }),
    }),
])

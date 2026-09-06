import { z } from 'zod'

import { ApiErrorSchema, IdSchema, TimestampSchema } from './common'
import { MessageSchema } from './conversations'
import { EffectivePersonaSchema } from './personas'
import { ModelRoleSchema, RegexPhaseSchema } from './prompts'
import { GenerationParametersSchema } from './providers'

export const GenerationRequestSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('reply'),
        content: z.string().max(1_000_000),
        idempotencyKey: z.string().min(8).max(200),
        clientInstanceId: z.uuid().optional(),
    }),
    z.object({
        mode: z.literal('regenerate'),
        idempotencyKey: z.string().min(8).max(200),
        clientInstanceId: z.uuid().optional(),
    }),
])

const LuaTriggerCommonSchema = z.object({
    idempotencyKey: z.uuid(),
    clientInstanceId: z.uuid(),
    sourceMessageId: IdSchema.nullable().optional(),
    triggerElementId: z.string().max(500).nullable().optional(),
})

export const LuaTriggerRequestSchema = z.discriminatedUnion('type', [
    LuaTriggerCommonSchema.extend({
        type: z.literal('manual'),
        name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,199}$/),
    }),
    LuaTriggerCommonSchema.extend({
        type: z.literal('button'),
        data: z.string().max(100_000),
    }),
])

export const LuaRemoteCommandResultSchema = z.object({
    clientInstanceId: z.uuid(),
    result: z.unknown(),
    error: z.string().max(10_000).optional(),
})

export const GenerationRunSchema = z.object({
    id: IdSchema,
    conversationId: IdSchema,
    messageId: IdSchema.nullable(),
    status: z.enum(['running', 'complete', 'cancelled', 'failed']),
    provider: z.string(),
    modelId: z.string(),
    parameters: GenerationParametersSchema,
    outputText: z.string(),
    processedOutputText: z.string(),
    inputTokens: z.number().int().nullable(),
    outputTokens: z.number().int().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    startedAt: TimestampSchema,
    completedAt: TimestampSchema.nullable(),
})

export const CompiledMessageSchema = z.object({
    role: ModelRoleSchema,
    content: z.string(),
})

export const PromptPreviewSchema = z.object({
    messages: z.array(CompiledMessageSchema),
    estimatedInputTokens: z.number().int().nonnegative(),
    reservedOutputTokens: z.number().int().positive(),
    activatedLoreIds: z.array(IdSchema),
    activeModuleIds: z.array(IdSchema).default([]),
    activeModules: z
        .array(
            z.object({
                id: IdSchema,
                source: z.enum(['default', 'character', 'preset', 'conversation']),
            }),
        )
        .default([]),
    effectiveToggles: z.record(z.string(), z.string()).default({}),
    activeRegexScriptIds: z.record(RegexPhaseSchema, z.array(z.string())).default({
        editinput: [],
        editprocess: [],
        editoutput: [],
        editdisplay: [],
    }),
    trimmedMessageIds: z.array(IdSchema),
    warnings: z.array(z.string()),
    persona: EffectivePersonaSchema.optional(),
    longTermMemory: z
        .object({
            enabled: z.boolean(),
            summaryCount: z.number().int().nonnegative(),
            selectedSummaryIds: z.array(IdSchema),
        })
        .optional(),
})

export const GenerationEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('generation.started'),
        generationId: IdSchema,
        messageId: IdSchema,
    }),
    z.object({
        type: z.literal('message.delta'),
        generationId: IdSchema,
        messageId: IdSchema,
        delta: z.string(),
    }),
    z.object({
        type: z.literal('message.snapshot'),
        generationId: IdSchema,
        messageId: IdSchema,
        content: z.string(),
    }),
    z.object({
        type: z.literal('message.completed'),
        generationId: IdSchema,
        message: MessageSchema,
        usage: z
            .object({
                inputTokens: z.number().optional(),
                outputTokens: z.number().optional(),
            })
            .optional(),
    }),
    z.object({
        type: z.literal('generation.failed'),
        generationId: IdSchema,
        messageId: IdSchema.optional(),
        error: ApiErrorSchema,
    }),
])

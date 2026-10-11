import type { GenerationParameters, RequestDebugSnapshot } from '@malang/shared'
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { createdAt, timestampMs } from './columns'
import { conversations, messages } from './conversations'

export const generationRuns = sqliteTable(
    'generation_runs',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        messageId: text('message_id').references(() => messages.id, { onDelete: 'set null' }),
        idempotencyKey: text('idempotency_key').notNull(),
        status: text('status', { enum: ['running', 'complete', 'cancelled', 'failed'] }).notNull(),
        provider: text('provider').notNull(),
        modelId: text('model_id').notNull(),
        parametersJson: text('parameters_json', { mode: 'json' })
            .$type<GenerationParameters>()
            .notNull(),
        outputText: text('output_text').notNull(),
        processedOutputText: text('processed_output_text').notNull().default(''),
        inputTokens: integer('input_tokens'),
        outputTokens: integer('output_tokens'),
        errorCode: text('error_code'),
        errorMessage: text('error_message'),
        startedAt: timestampMs('started_at').notNull(),
        completedAt: timestampMs('completed_at'),
    },
    (table) => [
        uniqueIndex('generation_idempotency_idx').on(table.conversationId, table.idempotencyKey),
    ],
)

export const requestDebugRecords = sqliteTable(
    'request_debug_records',
    {
        id: text('id').primaryKey(),
        generationId: text('generation_id')
            .notNull()
            .references(() => generationRuns.id, { onDelete: 'cascade' }),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        provider: text('provider').notNull(),
        modelId: text('model_id').notNull(),
        parametersJson: text('parameters_json', { mode: 'json' })
            .$type<GenerationParameters>()
            .notNull(),
        requestJson: text('request_json', { mode: 'json' }).$type<RequestDebugSnapshot>().notNull(),
        createdAt: createdAt(),
    },
    (table) => [index('request_debug_records_created_at_idx').on(sql`${table.createdAt} desc`)],
)

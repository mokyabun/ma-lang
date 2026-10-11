import type { BackgroundJobError } from '@malang/shared'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { timestampColumns, timestampMs } from './columns'
import { conversations } from './conversations'

export const backgroundJobs = sqliteTable(
    'background_jobs',
    {
        id: text('id').primaryKey(),
        kind: text('kind').notNull(),
        payloadJson: text('payload_json', { mode: 'json' }).$type<unknown>().notNull(),
        status: text('status', {
            enum: ['queued', 'running', 'complete', 'failed', 'cancelled'],
        }).notNull(),
        attempts: integer('attempts').notNull().default(0),
        maxAttempts: integer('max_attempts').notNull(),
        runAfter: timestampMs('run_after').notNull(),
        lockedAt: timestampMs('locked_at'),
        resultJson: text('result_json', { mode: 'json' }).$type<unknown>(),
        errorJson: text('error_json', { mode: 'json' }).$type<BackgroundJobError>(),
        conversationId: text('conversation_id').references(() => conversations.id, {
            onDelete: 'cascade',
        }),
        // No foreign key: a job outlives its message long enough to be cancelled.
        messageId: text('message_id'),
        ...timestampColumns,
        completedAt: timestampMs('completed_at'),
    },
    (table) => [
        index('background_jobs_ready_idx').on(table.status, table.runAfter),
        index('background_jobs_conversation_idx').on(table.conversationId),
        index('background_jobs_message_idx').on(table.messageId),
    ],
)

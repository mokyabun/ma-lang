import type { LongTermMemoryMetrics, LongTermMemorySettings } from '@malang/shared'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { timestampColumns, updatedAt } from './columns'
import { conversations } from './conversations'

type SparseVector = Record<string, number>

export const conversationMemorySettings = sqliteTable('conversation_memory_settings', {
    conversationId: text('conversation_id')
        .primaryKey()
        .references(() => conversations.id, { onDelete: 'cascade' }),
    settingsJson: text('settings_json', { mode: 'json' }).$type<LongTermMemorySettings>().notNull(),
    metricsJson: text('metrics_json', { mode: 'json' })
        .$type<LongTermMemoryMetrics>()
        .notNull()
        .default({
            importantSummaryIds: [],
            recentSummaryIds: [],
            similarSummaryIds: [],
            randomSummaryIds: [],
        }),
    updatedAt: updatedAt(),
})

export const conversationMemorySummaries = sqliteTable(
    'conversation_memory_summaries',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        text: text('text').notNull(),
        sourceMessageIdsJson: text('source_message_ids_json', { mode: 'json' })
            .$type<string[]>()
            .notNull(),
        vectorJson: text('vector_json', { mode: 'json' }).$type<SparseVector>().notNull(),
        isImportant: integer('is_important', { mode: 'boolean' }).notNull().default(false),
        ...timestampColumns,
    },
    (table) => [
        index('conversation_memory_summaries_conversation_idx').on(
            table.conversationId,
            table.createdAt,
        ),
    ],
)

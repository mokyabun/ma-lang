import type { ModelChainGraph, ModelChainLayer, ProviderConfig } from '@malang/shared'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { timestampColumns, updatedAt } from './columns'
import { conversations } from './conversations'

type ModelChainConfig = {
    version: 2 | 3
    layers: ModelChainLayer[]
    graph?: ModelChainGraph
}

export const modelApiKeys = sqliteTable('model_api_keys', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    credentialType: text('credential_type', {
        enum: ['apiKey', 'serviceAccount', 'aws'],
    }).notNull(),
    hint: text('hint').notNull().default(''),
    ...timestampColumns,
})

export const modelPresets = sqliteTable('model_presets', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    providerJson: text('provider_json', { mode: 'json' }).$type<ProviderConfig>().notNull(),
    apiKeyId: text('api_key_id').references(() => modelApiKeys.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampColumns,
})

export const modelChainPresets = sqliteTable('model_chain_presets', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    configJson: text('config_json', { mode: 'json' }).$type<ModelChainConfig>().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampColumns,
})

export const modelChainAgentMemories = sqliteTable(
    'model_chain_agent_memories',
    {
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        agentId: text('agent_id').notNull(),
        content: text('content').notNull().default(''),
        updatedAt: updatedAt(),
    },
    (table) => [primaryKey({ columns: [table.conversationId, table.agentId] })],
)

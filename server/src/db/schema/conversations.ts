import type { LoreEntry } from '@malang/shared'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { characters } from './characters'
import { type StringMap, timestampColumns, timestampMs, updatedAt } from './columns'
import { modelChainPresets } from './models'
import { personas } from './personas'
import { promptModules, promptPresets } from './prompts'

export const conversationGroups = sqliteTable(
    'conversation_groups',
    {
        id: text('id').primaryKey(),
        characterId: text('character_id')
            .notNull()
            .references(() => characters.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        sortOrder: integer('sort_order').notNull(),
        ...timestampColumns,
    },
    (table) => [
        index('conversation_groups_character_order_idx').on(table.characterId, table.sortOrder),
    ],
)

export const conversations = sqliteTable(
    'conversations',
    {
        id: text('id').primaryKey(),
        characterId: text('character_id')
            .notNull()
            .references(() => characters.id, { onDelete: 'restrict' }),
        promptPresetId: text('prompt_preset_id')
            .notNull()
            .references(() => promptPresets.id, { onDelete: 'restrict' }),
        promptPresetLocked: integer('prompt_preset_locked', { mode: 'boolean' })
            .notNull()
            .default(false),
        modelPresetId: text('model_preset_id'),
        auxiliaryModelPresetId: text('auxiliary_model_preset_id'),
        modelChainPresetId: text('model_chain_preset_id').references(() => modelChainPresets.id, {
            onDelete: 'restrict',
        }),
        title: text('title').notNull(),
        greetingIndex: integer('greeting_index').notNull(),
        variablesJson: text('variables_json', { mode: 'json' }).$type<StringMap>().notNull(),
        authorNote: text('author_note').notNull().default(''),
        boundPersonaId: text('bound_persona_id').references(() => personas.id, {
            onDelete: 'set null',
        }),
        personaLocked: integer('persona_locked', { mode: 'boolean' }).notNull().default(false),
        groupId: text('group_id').references(() => conversationGroups.id, { onDelete: 'set null' }),
        sortOrder: integer('sort_order').notNull().default(0),
        archivedAt: timestampMs('archived_at'),
        displayEpoch: integer('display_epoch').notNull().default(0),
        ...timestampColumns,
    },
    (table) => [
        index('conversations_group_order_idx').on(
            table.characterId,
            table.groupId,
            table.sortOrder,
        ),
    ],
)

export const conversationModules = sqliteTable(
    'conversation_modules',
    {
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        moduleId: text('module_id')
            .notNull()
            .references(() => promptModules.id, { onDelete: 'cascade' }),
        enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    },
    (table) => [primaryKey({ columns: [table.conversationId, table.moduleId] })],
)

export const messages = sqliteTable(
    'messages',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
        content: text('content').notNull(),
        position: integer('position').notNull(),
        status: text('status', {
            enum: ['complete', 'streaming', 'cancelled', 'failed'],
        }).notNull(),
        ...timestampColumns,
    },
    (table) => [
        uniqueIndex('messages_conversation_position_idx').on(table.conversationId, table.position),
    ],
)

export const conversationLoreEntries = sqliteTable(
    'conversation_lore_entries',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        entryJson: text('entry_json', { mode: 'json' }).$type<LoreEntry>().notNull(),
        updatedAt: updatedAt(),
    },
    (table) => [
        uniqueIndex('conversation_lore_entries_name_idx').on(table.conversationId, table.name),
    ],
)

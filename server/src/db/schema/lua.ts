import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { type JsonObject, createdAt, timestampMs, updatedAt } from './columns'
import { conversations } from './conversations'

export const luaStates = sqliteTable(
    'lua_states',
    {
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        ownerType: text('owner_type', { enum: ['character', 'module'] }).notNull(),
        ownerId: text('owner_id').notNull(),
        stateKey: text('state_key').notNull(),
        valueJson: text('value_json', { mode: 'json' }).$type<unknown>().notNull(),
        version: integer('version').notNull().default(1),
        updatedAt: updatedAt(),
    },
    (table) => [
        primaryKey({
            columns: [table.conversationId, table.ownerType, table.ownerId, table.stateKey],
        }),
    ],
)

export const luaEventRuns = sqliteTable(
    'lua_event_runs',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        eventKey: text('event_key').notNull(),
        phase: text('phase').notNull(),
        clientInstanceId: text('client_instance_id'),
        status: text('status', { enum: ['running', 'complete', 'failed'] }).notNull(),
        inputJson: text('input_json', { mode: 'json' }).$type<JsonObject>().notNull().default({}),
        resultJson: text('result_json', { mode: 'json' }).$type<unknown>(),
        errorJson: text('error_json', { mode: 'json' }).$type<JsonObject>(),
        createdAt: createdAt(),
        completedAt: timestampMs('completed_at'),
    },
    (table) => [
        uniqueIndex('lua_event_runs_unique_idx').on(
            table.conversationId,
            table.eventKey,
            table.phase,
        ),
    ],
)

export const luaInvocations = sqliteTable(
    'lua_invocations',
    {
        id: text('id').primaryKey(),
        eventRunId: text('event_run_id')
            .notNull()
            .references(() => luaEventRuns.id, { onDelete: 'cascade' }),
        ownerType: text('owner_type', { enum: ['character', 'module'] }).notNull(),
        ownerId: text('owner_id').notNull(),
        scriptRevision: integer('script_revision').notNull(),
        sequence: integer('sequence').notNull(),
        status: text('status', { enum: ['running', 'complete', 'failed'] }).notNull(),
        resultJson: text('result_json', { mode: 'json' }).$type<unknown>(),
        warningsJson: text('warnings_json', { mode: 'json' })
            .$type<string[]>()
            .notNull()
            .default([]),
        errorJson: text('error_json', { mode: 'json' }).$type<JsonObject>(),
        createdAt: createdAt(),
        completedAt: timestampMs('completed_at'),
    },
    (table) => [
        uniqueIndex('lua_invocations_unique_idx').on(
            table.eventRunId,
            table.ownerType,
            table.ownerId,
            table.scriptRevision,
        ),
    ],
)

export const luaApiCalls = sqliteTable(
    'lua_api_calls',
    {
        id: text('id').primaryKey(),
        invocationId: text('invocation_id')
            .notNull()
            .references(() => luaInvocations.id, { onDelete: 'cascade' }),
        callIndex: integer('call_index').notNull(),
        operation: text('operation').notNull(),
        status: text('status', {
            enum: ['running', 'complete', 'failed', 'indeterminate'],
        }).notNull(),
        requestJson: text('request_json', { mode: 'json' })
            .$type<JsonObject>()
            .notNull()
            .default({}),
        resultJson: text('result_json', { mode: 'json' }).$type<unknown>(),
        errorJson: text('error_json', { mode: 'json' }).$type<JsonObject>(),
        createdAt: createdAt(),
        completedAt: timestampMs('completed_at'),
    },
    (table) => [uniqueIndex('lua_api_calls_unique_idx').on(table.invocationId, table.callIndex)],
)

export const luaRemoteCommands = sqliteTable(
    'lua_remote_commands',
    {
        id: text('id').primaryKey(),
        invocationId: text('invocation_id')
            .notNull()
            .references(() => luaInvocations.id, { onDelete: 'cascade' }),
        callIndex: integer('call_index').notNull(),
        clientInstanceId: text('client_instance_id').notNull(),
        kind: text('kind').notNull(),
        payloadJson: text('payload_json', { mode: 'json' }).$type<unknown>().notNull(),
        resultJson: text('result_json', { mode: 'json' }).$type<unknown>(),
        status: text('status', { enum: ['pending', 'complete', 'failed', 'expired'] }).notNull(),
        blocking: integer('blocking', { mode: 'boolean' }).notNull().default(false),
        expiresAt: timestampMs('expires_at').notNull(),
        createdAt: createdAt(),
        completedAt: timestampMs('completed_at'),
    },
    (table) => [
        uniqueIndex('lua_remote_commands_unique_idx').on(table.invocationId, table.callIndex),
        index('lua_remote_commands_client_idx').on(
            table.clientInstanceId,
            table.status,
            table.createdAt,
        ),
    ],
)

export const luaDisplayBatches = sqliteTable(
    'lua_display_batches',
    {
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        displayEpoch: integer('display_epoch').notNull(),
        scriptSetHash: text('script_set_hash').notNull(),
        status: text('status', { enum: ['running', 'complete', 'failed'] }).notNull(),
        resultJson: text('result_json', { mode: 'json' }).$type<unknown>(),
        errorJson: text('error_json', { mode: 'json' }).$type<JsonObject>(),
        createdAt: createdAt(),
        completedAt: timestampMs('completed_at'),
    },
    (table) => [
        primaryKey({ columns: [table.conversationId, table.displayEpoch, table.scriptSetHash] }),
    ],
)

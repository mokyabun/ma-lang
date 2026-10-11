import type {
    ContinuityTracking,
    IllustrationMode,
    IllustrationState,
    IllustrationStateKind,
    IllustrationStyleParams,
    ImageSizePreset,
    MessageIllustrationStatus,
    NovelAIImageParams,
} from '@malang/shared'
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { assets } from './assets'
import { characters } from './characters'
import { createdAt, timestampColumns, updatedAt } from './columns'
import { conversations, messages } from './conversations'
import { generationRuns } from './generations'
import { personas } from './personas'

export const illustrationSettings = sqliteTable('illustration_settings', {
    id: integer('id').primaryKey(),
    imageProvider: text('image_provider', { enum: ['novelai'] })
        .notNull()
        .default('novelai'),
    novelaiEndpoint: text('novelai_endpoint').notNull(),

    /** Opaque SecretVault envelope; never returned by the API. */
    novelaiApiKeySecret: text('novelai_api_key_secret'),
    novelaiApiKeyHint: text('novelai_api_key_hint').notNull().default(''),
    defaultImageParamsJson: text('default_image_params_json', { mode: 'json' })
        .$type<NovelAIImageParams>()
        .notNull(),
    analysisModelPresetId: text('analysis_model_preset_id'),
    // Not a foreign key: deleting a style clears it in the same transaction.
    defaultStyleId: text('default_style_id'),
    defaultMode: text('default_mode', { enum: ['manual', 'auto'] })
        .$type<IllustrationMode>()
        .notNull()
        .default('manual'),
    defaultCountMin: integer('default_count_min').notNull().default(1),
    defaultCountMax: integer('default_count_max').notNull().default(1),
    contextMessageCount: integer('context_message_count').notNull().default(6),
    analysisInstruction: text('analysis_instruction').notNull().default(''),
    fixedPositive: text('fixed_positive').notNull().default(''),
    fixedNegative: text('fixed_negative').notNull().default(''),
    /** Empty means the built-in size presets. */
    sizePresetsJson: text('size_presets_json', { mode: 'json' })
        .$type<ImageSizePreset[]>()
        .notNull()
        .default([]),
    continuityTracking: text('continuity_tracking', {
        enum: ['with-illustration', 'every-message'],
    })
        .$type<ContinuityTracking>()
        .notNull()
        .default('with-illustration'),
    updatedAt: updatedAt(),
})

export const illustrationStyles = sqliteTable('illustration_styles', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sceneTemplate: text('scene_template').notNull(),
    negative: text('negative').notNull(),
    paramsJson: text('params_json', { mode: 'json' })
        .$type<IllustrationStyleParams>()
        .notNull()
        .default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampColumns,
})

export const illustrationActors = sqliteTable(
    'illustration_actors',
    {
        id: text('id').primaryKey(),
        characterId: text('character_id').references(() => characters.id, {
            onDelete: 'cascade',
        }),
        personaId: text('persona_id').references(() => personas.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        keysJson: text('keys_json', { mode: 'json' }).$type<string[]>().notNull().default([]),
        promptTemplate: text('prompt_template').notNull(),
        negative: text('negative').notNull(),
        enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
        sortOrder: integer('sort_order').notNull().default(0),
        ...timestampColumns,
    },
    (table) => [
        index('illustration_actors_character_idx').on(table.characterId, table.sortOrder),
        // A persona stands for one person, so it has at most one actor.
        uniqueIndex('illustration_actors_persona_idx')
            .on(table.personaId)
            .where(sql`${table.personaId} IS NOT NULL`),
        check(
            'illustration_actors_one_owner',
            sql`(${table.characterId} IS NULL) <> (${table.personaId} IS NULL)`,
        ),
    ],
)

export const illustrationOutfits = sqliteTable(
    'illustration_outfits',
    {
        id: text('id').primaryKey(),
        actorId: text('actor_id')
            .notNull()
            .references(() => illustrationActors.id, { onDelete: 'cascade' }),
        conversationId: text('conversation_id').references(() => conversations.id, {
            onDelete: 'cascade',
        }),
        name: text('name').notNull(),
        prompt: text('prompt').notNull(),
        negative: text('negative').notNull(),
        isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
        enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
        sortOrder: integer('sort_order').notNull().default(0),
        ...timestampColumns,
    },
    (table) => [
        index('illustration_outfits_actor_idx').on(table.actorId, table.sortOrder),
        index('illustration_outfits_conversation_idx').on(table.conversationId),
    ],
)

export const conversationIllustrationSettings = sqliteTable('conversation_illustration_settings', {
    conversationId: text('conversation_id')
        .primaryKey()
        .references(() => conversations.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    mode: text('mode', { enum: ['manual', 'auto'] })
        .$type<IllustrationMode>()
        .notNull(),
    countMin: integer('count_min').notNull(),
    countMax: integer('count_max').notNull(),
    styleId: text('style_id').references(() => illustrationStyles.id, {
        onDelete: 'set null',
    }),
    analysisModelPresetId: text('analysis_model_preset_id'),
    sceneDirection: text('scene_direction').notNull().default(''),
    updatedAt: updatedAt(),
})

export interface IllustrationCaption {
    prompt: string
    negative: string
}

export const messageIllustrations = sqliteTable(
    'message_illustrations',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        messageId: text('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        // The output that holds this illustration's token; switching outputs keeps it.
        generationRunId: text('generation_run_id').references(() => generationRuns.id, {
            onDelete: 'set null',
        }),
        /** Paragraph the token follows, counted from 1. */
        slotIndex: integer('slot_index').notNull(),
        status: text('status', { enum: ['pending', 'rendering', 'complete', 'failed'] })
            .$type<MessageIllustrationStatus>()
            .notNull(),
        /** The analysis AI's entry for this slot, verbatim. */
        planJson: text('plan_json', { mode: 'json' }).$type<unknown>().notNull(),
        positive: text('positive').notNull(),
        negative: text('negative').notNull(),
        charCaptionsJson: text('char_captions_json', { mode: 'json' })
            .$type<IllustrationCaption[]>()
            .notNull(),
        paramsJson: text('params_json', { mode: 'json' }).$type<NovelAIImageParams>().notNull(),
        activeRevisionId: text('active_revision_id'),
        error: text('error'),
        ...timestampColumns,
    },
    (table) => [
        index('message_illustrations_message_idx').on(table.messageId, table.slotIndex),
        index('message_illustrations_conversation_idx').on(table.conversationId),
    ],
)

export const illustrationRevisions = sqliteTable(
    'illustration_revisions',
    {
        id: text('id').primaryKey(),
        illustrationId: text('illustration_id')
            .notNull()
            .references(() => messageIllustrations.id, { onDelete: 'cascade' }),
        assetId: text('asset_id')
            .notNull()
            .references(() => assets.id, { onDelete: 'restrict' }),
        seed: integer('seed').notNull(),
        /** The full NovelAI request without the API key. */
        requestJson: text('request_json', { mode: 'json' }).$type<unknown>().notNull(),
        createdAt: createdAt(),
    },
    (table) => [index('illustration_revisions_illustration_idx').on(table.illustrationId)],
)

export const illustrationStateDefinitions = sqliteTable(
    'illustration_state_definitions',
    {
        id: text('id').primaryKey(),
        /** Null defines the state for every character. */
        characterId: text('character_id').references(() => characters.id, {
            onDelete: 'cascade',
        }),
        key: text('key').notNull(),
        label: text('label').notNull(),
        instruction: text('instruction').notNull().default(''),
        kind: text('kind', { enum: ['flag', 'counter', 'choice'] })
            .$type<IllustrationStateKind>()
            .notNull(),
        tags: text('tags').notNull().default(''),
        optionsJson: text('options_json', { mode: 'json' })
            .$type<Array<{ value: string; tags: string }>>()
            .notNull()
            .default([]),
        thresholdsJson: text('thresholds_json', { mode: 'json' })
            .$type<Array<{ min: number; tags: string }>>()
            .notNull()
            .default([]),
        lifetimeTurns: integer('lifetime_turns'),
        sortOrder: integer('sort_order').notNull().default(0),
        ...timestampColumns,
    },
    (table) => [index('illustration_state_definitions_character_idx').on(table.characterId)],
)

export const illustrationStateSnapshots = sqliteTable(
    'illustration_state_snapshots',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        messageId: text('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        // Keyed by output so regenerating or switching outputs picks the matching state.
        generationRunId: text('generation_run_id').references(() => generationRuns.id, {
            onDelete: 'cascade',
        }),
        stateJson: text('state_json', { mode: 'json' }).$type<IllustrationState>().notNull(),
        source: text('source', { enum: ['analysis', 'manual'] }).notNull(),
        ...timestampColumns,
    },
    (table) => [
        index('illustration_state_snapshots_conversation_idx').on(table.conversationId),
        index('illustration_state_snapshots_message_idx').on(table.messageId),
    ],
)

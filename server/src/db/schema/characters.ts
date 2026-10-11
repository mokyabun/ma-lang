import type { BiasEntry, LoreSettings, RegexScript } from '@malang/shared'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { assets } from './assets'
import { type JsonObject, type StringMap, timestampColumns, timestampMs } from './columns'

export const characterGroups = sqliteTable('character_groups', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    ...timestampColumns,
})

export const characters = sqliteTable(
    'characters',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        description: text('description').notNull(),
        personality: text('personality').notNull(),
        scenario: text('scenario').notNull(),
        firstMessage: text('first_message').notNull(),
        alternateGreetingsJson: text('alternate_greetings_json', { mode: 'json' })
            .$type<string[]>()
            .notNull(),
        exampleMessage: text('example_message').notNull(),
        systemPrompt: text('system_prompt').notNull(),
        postHistoryInstructions: text('post_history_instructions').notNull(),
        creator: text('creator').notNull(),
        characterVersion: text('character_version').notNull(),
        tagsJson: text('tags_json', { mode: 'json' }).$type<string[]>().notNull(),
        avatarAssetId: text('avatar_asset_id').references(() => assets.id, {
            onDelete: 'set null',
        }),
        sourceSpec: text('source_spec', { enum: ['v2', 'v3'] }).notNull(),
        sourceExtensionsJson: text('source_extensions_json', { mode: 'json' })
            .$type<JsonObject>()
            .notNull(),
        sourceCardJson: text('source_card_json', { mode: 'json' }).$type<JsonObject>().notNull(),
        loreSettingsJson: text('lore_settings_json', { mode: 'json' })
            .$type<LoreSettings>()
            .notNull(),
        regexScriptsJson: text('regex_scripts_json', { mode: 'json' })
            .$type<RegexScript[]>()
            .notNull()
            .default([]),
        moduleReferencesJson: text('module_references_json', { mode: 'json' })
            .$type<string[]>()
            .notNull()
            .default([]),
        defaultVariablesJson: text('default_variables_json', { mode: 'json' })
            .$type<StringMap>()
            .notNull()
            .default({}),
        biasJson: text('bias_json', { mode: 'json' }).$type<BiasEntry[]>().notNull().default([]),
        luaCode: text('lua_code'),
        luaEnabled: integer('lua_enabled', { mode: 'boolean' }).notNull().default(false),
        luaLowLevelAccess: integer('lua_low_level_access', { mode: 'boolean' })
            .notNull()
            .default(false),
        luaRevision: integer('lua_revision').notNull().default(0),
        luaCodeSha256: text('lua_code_sha256').notNull().default(''),
        luaRawTriggerJson: text('lua_raw_trigger_json', { mode: 'json' })
            .$type<unknown[]>()
            .notNull()
            .default([]),
        groupId: text('group_id').references(() => characterGroups.id, { onDelete: 'set null' }),
        sortOrder: integer('sort_order').notNull().default(0),
        archivedAt: timestampMs('archived_at'),
        ...timestampColumns,
    },
    (table) => [index('characters_group_order_idx').on(table.groupId, table.sortOrder)],
)

export const characterLoreEntries = sqliteTable(
    'character_lore_entries',
    {
        id: text('id').primaryKey(),
        characterId: text('character_id')
            .notNull()
            .references(() => characters.id, { onDelete: 'cascade' }),
        keysJson: text('keys_json', { mode: 'json' }).$type<string[]>().notNull(),
        secondaryKeysJson: text('secondary_keys_json', { mode: 'json' })
            .$type<string[]>()
            .notNull(),
        content: text('content').notNull(),
        enabled: integer('enabled', { mode: 'boolean' }).notNull(),
        constant: integer('constant', { mode: 'boolean' }).notNull(),
        selective: integer('selective', { mode: 'boolean' }).notNull(),
        caseSensitive: integer('case_sensitive', { mode: 'boolean' }).notNull(),
        useRegex: integer('use_regex', { mode: 'boolean' }).notNull(),
        insertionOrder: integer('insertion_order').notNull(),
        priority: integer('priority').notNull(),
        name: text('name').notNull(),
        extensionsJson: text('extensions_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    },
    (table) => [index('character_lore_character_idx').on(table.characterId)],
)

export const characterAssets = sqliteTable(
    'character_assets',
    {
        id: text('id').primaryKey(),
        characterId: text('character_id')
            .notNull()
            .references(() => characters.id, { onDelete: 'cascade' }),
        assetId: text('asset_id')
            .notNull()
            .references(() => assets.id, { onDelete: 'restrict' }),
        type: text('type').notNull(),
        name: text('name').notNull(),
        extension: text('extension').notNull(),
        sourceUri: text('source_uri').notNull(),
    },
    (table) => [index('character_assets_character_idx').on(table.characterId)],
)

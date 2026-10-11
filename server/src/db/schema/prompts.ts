import type {
    BiasEntry,
    GenerationParameters,
    LoreEntryInput,
    ModulePrompt,
    PromptBlock,
    PromptSettings,
    PromptToggle,
    RegexScript,
} from '@malang/shared'
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { assets } from './assets'
import { type JsonObject, type StringMap, timestampColumns } from './columns'

export const promptPresets = sqliteTable('prompt_presets', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    blocksJson: text('blocks_json', { mode: 'json' }).$type<PromptBlock[]>().notNull(),
    parametersJson: text('parameters_json', { mode: 'json' })
        .$type<GenerationParameters>()
        .notNull(),
    defaultVariablesJson: text('default_variables_json', { mode: 'json' })
        .$type<StringMap>()
        .notNull(),
    togglesJson: text('toggles_json', { mode: 'json' })
        .$type<PromptToggle[]>()
        .notNull()
        .default([]),
    regexScriptsJson: text('regex_scripts_json', { mode: 'json' })
        .$type<RegexScript[]>()
        .notNull()
        .default([]),
    moduleIntegrationsJson: text('module_integrations_json', { mode: 'json' })
        .$type<string[]>()
        .notNull()
        .default([]),
    biasJson: text('bias_json', { mode: 'json' }).$type<BiasEntry[]>().notNull().default([]),
    promptSettingsJson: text('prompt_settings_json', { mode: 'json' })
        .$type<PromptSettings>()
        .notNull()
        .default({
            assistantPrefill: '',
            postEndInnerFormat: '',
            sendChatAsSystem: false,
            sendName: false,
            trimStartNewChat: false,
            groupTemplate: '',
        }),
    warningsJson: text('warnings_json', { mode: 'json' }).$type<string[]>().notNull(),
    sourceJson: text('source_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    ...timestampColumns,
})

export const promptModules = sqliteTable(
    'prompt_modules',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        description: text('description').notNull(),
        namespace: text('namespace').notNull(),
        sourceId: text('source_id').notNull().default(''),
        runtimeOrder: integer('runtime_order').notNull().default(0),
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
        enabledByDefault: integer('enabled_by_default', { mode: 'boolean' })
            .notNull()
            .default(false),
        promptsJson: text('prompts_json', { mode: 'json' }).$type<ModulePrompt[]>().notNull(),
        togglesJson: text('toggles_json', { mode: 'json' }).$type<PromptToggle[]>().notNull(),
        regexScriptsJson: text('regex_scripts_json', { mode: 'json' })
            .$type<RegexScript[]>()
            .notNull()
            .default([]),
        backgroundEmbedding: text('background_embedding').notNull().default(''),
        lorebookJson: text('lorebook_json', { mode: 'json' })
            .$type<LoreEntryInput[]>()
            .notNull()
            .default([]),
        warningsJson: text('warnings_json', { mode: 'json' }).$type<string[]>().notNull(),
        sourceJson: text('source_json', { mode: 'json' }).$type<JsonObject>().notNull(),
        ...timestampColumns,
    },
    (table) => [
        // Modules without a namespace may coexist; named namespaces must be unique.
        uniqueIndex('prompt_modules_namespace_idx')
            .on(table.namespace)
            .where(sql`${table.namespace} <> ''`),
    ],
)

export const promptModuleAssets = sqliteTable(
    'prompt_module_assets',
    {
        id: text('id').primaryKey(),
        moduleId: text('module_id')
            .notNull()
            .references(() => promptModules.id, { onDelete: 'cascade' }),
        assetId: text('asset_id')
            .notNull()
            .references(() => assets.id, { onDelete: 'restrict' }),
        type: text('type').notNull(),
        name: text('name').notNull(),
        extension: text('extension').notNull(),
        sourceUri: text('source_uri').notNull(),
    },
    (table) => [index('prompt_module_assets_module_idx').on(table.moduleId)],
)

import type {
    BiasEntry,
    GenerationParameters,
    LoreEntry,
    LoreEntryInput,
    LoreSettings,
    LongTermMemoryMetrics,
    LongTermMemorySettings,
    ModelChainGraph,
    ModelChainLayer,
    ModulePrompt,
    PromptBlock,
    PromptSettings,
    PromptToggle,
    ProviderConfig,
    RegexScript,
    RequestDebugSnapshot,
} from '@malang/shared'
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

type JsonObject = Record<string, unknown>
type StringMap = Record<string, string>
type ModelChainConfig = {
    version: 2 | 3
    layers: ModelChainLayer[]
    graph?: ModelChainGraph
}
type SparseVector = Record<string, number>

const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' })
const createdAt = () =>
    timestampMs('created_at')
        .notNull()
        .default(sql`(unixepoch('subsecond') * 1000)`)
const updatedAt = () =>
    timestampMs('updated_at')
        .notNull()
        .default(sql`(unixepoch('subsecond') * 1000)`)
        .$onUpdate(() => new Date())

const timestampColumns = {
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}

export const adminUsers = sqliteTable('admin_users', {
    id: text('id').primaryKey(),
    passwordHash: text('password_hash').notNull(),
    ...timestampColumns,
})

export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id').primaryKey(),
        adminId: text('admin_id')
            .notNull()
            .references(() => adminUsers.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull(),
        expiresAt: timestampMs('expires_at').notNull(),
        createdAt: createdAt(),
    },
    (table) => [uniqueIndex('sessions_token_hash_idx').on(table.tokenHash)],
)

export const appSettings = sqliteTable('app_settings', {
    id: integer('id').primaryKey(),
    userName: text('user_name').notNull(),
    globalVariablesJson: text('global_variables_json', { mode: 'json' })
        .$type<StringMap>()
        .notNull()
        .default({}),
    promptToggleValuesJson: text('prompt_toggle_values_json', { mode: 'json' })
        .$type<StringMap>()
        .notNull()
        .default({}),
    defaultPromptPresetId: text('default_prompt_preset_id'),
    defaultModelPresetId: text('default_model_preset_id'),
    defaultAuxiliaryModelPresetId: text('default_auxiliary_model_preset_id'),
    selectedPersonaId: text('selected_persona_id').references(() => personas.id, {
        onDelete: 'set null',
    }),
    requestDebugEnabled: integer('request_debug_enabled', { mode: 'boolean' })
        .notNull()
        .default(false),
    jailbreakToggle: integer('jailbreak_toggle', { mode: 'boolean' }).notNull().default(false),
    chainOfThought: integer('chain_of_thought', { mode: 'boolean' }).notNull().default(false),
    providerJson: text('provider_json', { mode: 'json' }).$type<ProviderConfig>(),
    autoBackupEnabled: integer('auto_backup_enabled', { mode: 'boolean' }).notNull().default(true),
    secretSalt: text('secret_salt'),

    /** Opaque SecretVault envelope. */
    providerSecretJson: text('provider_secret_json'),
    updatedAt: updatedAt(),
})

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

export const assets = sqliteTable(
    'assets',
    {
        id: text('id').primaryKey(),
        sha256: text('sha256').notNull(),
        mimeType: text('mime_type').notNull(),
        size: integer('size').notNull(),
        path: text('path').notNull(),
        createdAt: createdAt(),
    },
    (table) => [uniqueIndex('assets_sha256_idx').on(table.sha256)],
)

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

export const personas = sqliteTable('personas', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    note: text('note').notNull().default(''),
    avatarAssetId: text('avatar_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    ...timestampColumns,
})

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

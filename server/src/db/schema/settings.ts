import type { ProviderConfig } from '@malang/shared'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { type StringMap, updatedAt } from './columns'
import { personas } from './personas'

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

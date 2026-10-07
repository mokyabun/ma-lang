CREATE TABLE `admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_name` text NOT NULL,
	`global_variables_json` text DEFAULT '{}' NOT NULL,
	`prompt_toggle_values_json` text DEFAULT '{}' NOT NULL,
	`default_prompt_preset_id` text,
	`default_model_preset_id` text,
	`default_auxiliary_model_preset_id` text,
	`selected_persona_id` text,
	`request_debug_enabled` integer DEFAULT false NOT NULL,
	`jailbreak_toggle` integer DEFAULT false NOT NULL,
	`chain_of_thought` integer DEFAULT false NOT NULL,
	`provider_json` text,
	`auto_backup_enabled` integer DEFAULT true NOT NULL,
	`secret_salt` text,
	`provider_secret_json` text,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`selected_persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_sha256_idx` ON `assets` (`sha256`);--> statement-breakpoint
CREATE TABLE `character_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`extension` text NOT NULL,
	`source_uri` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `character_assets_character_idx` ON `character_assets` (`character_id`);--> statement-breakpoint
CREATE TABLE `character_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `character_lore_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`keys_json` text NOT NULL,
	`secondary_keys_json` text NOT NULL,
	`content` text NOT NULL,
	`enabled` integer NOT NULL,
	`constant` integer NOT NULL,
	`selective` integer NOT NULL,
	`case_sensitive` integer NOT NULL,
	`use_regex` integer NOT NULL,
	`insertion_order` integer NOT NULL,
	`priority` integer NOT NULL,
	`name` text NOT NULL,
	`extensions_json` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_lore_character_idx` ON `character_lore_entries` (`character_id`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`personality` text NOT NULL,
	`scenario` text NOT NULL,
	`first_message` text NOT NULL,
	`alternate_greetings_json` text NOT NULL,
	`example_message` text NOT NULL,
	`system_prompt` text NOT NULL,
	`post_history_instructions` text NOT NULL,
	`creator` text NOT NULL,
	`character_version` text NOT NULL,
	`tags_json` text NOT NULL,
	`avatar_asset_id` text,
	`source_spec` text NOT NULL,
	`source_extensions_json` text NOT NULL,
	`source_card_json` text NOT NULL,
	`lore_settings_json` text NOT NULL,
	`regex_scripts_json` text DEFAULT '[]' NOT NULL,
	`module_references_json` text DEFAULT '[]' NOT NULL,
	`default_variables_json` text DEFAULT '{}' NOT NULL,
	`lua_code` text,
	`lua_enabled` integer DEFAULT false NOT NULL,
	`lua_low_level_access` integer DEFAULT false NOT NULL,
	`lua_revision` integer DEFAULT 0 NOT NULL,
	`lua_code_sha256` text DEFAULT '' NOT NULL,
	`lua_raw_trigger_json` text DEFAULT '[]' NOT NULL,
	`group_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`avatar_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`group_id`) REFERENCES `character_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `characters_group_order_idx` ON `characters` (`group_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `conversation_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_groups_character_order_idx` ON `conversation_groups` (`character_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `conversation_lore_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`name` text NOT NULL,
	`entry_json` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_lore_entries_name_idx` ON `conversation_lore_entries` (`conversation_id`,`name`);--> statement-breakpoint
CREATE TABLE `conversation_memory_settings` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`settings_json` text NOT NULL,
	`metrics_json` text DEFAULT '{"importantSummaryIds":[],"recentSummaryIds":[],"similarSummaryIds":[],"randomSummaryIds":[]}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversation_memory_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`text` text NOT NULL,
	`source_message_ids_json` text NOT NULL,
	`vector_json` text NOT NULL,
	`is_important` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_memory_summaries_conversation_idx` ON `conversation_memory_summaries` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_modules` (
	`conversation_id` text NOT NULL,
	`module_id` text NOT NULL,
	`enabled` integer NOT NULL,
	PRIMARY KEY(`conversation_id`, `module_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `prompt_modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`prompt_preset_id` text NOT NULL,
	`prompt_preset_locked` integer DEFAULT false NOT NULL,
	`model_preset_id` text,
	`auxiliary_model_preset_id` text,
	`model_chain_preset_id` text,
	`title` text NOT NULL,
	`greeting_index` integer NOT NULL,
	`variables_json` text NOT NULL,
	`author_note` text DEFAULT '' NOT NULL,
	`bound_persona_id` text,
	`persona_locked` integer DEFAULT false NOT NULL,
	`group_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`display_epoch` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prompt_preset_id`) REFERENCES `prompt_presets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`model_chain_preset_id`) REFERENCES `model_chain_presets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`bound_persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`group_id`) REFERENCES `conversation_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversations_group_order_idx` ON `conversations` (`character_id`,`group_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `generation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`parameters_json` text NOT NULL,
	`output_text` text NOT NULL,
	`processed_output_text` text DEFAULT '' NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`error_code` text,
	`error_message` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_idempotency_idx` ON `generation_runs` (`conversation_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `lua_api_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`invocation_id` text NOT NULL,
	`call_index` integer NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`request_json` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`error_json` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`invocation_id`) REFERENCES `lua_invocations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lua_api_calls_unique_idx` ON `lua_api_calls` (`invocation_id`,`call_index`);--> statement-breakpoint
CREATE TABLE `lua_display_batches` (
	`conversation_id` text NOT NULL,
	`display_epoch` integer NOT NULL,
	`script_set_hash` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text,
	`error_json` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`completed_at` integer,
	PRIMARY KEY(`conversation_id`, `display_epoch`, `script_set_hash`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lua_event_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`event_key` text NOT NULL,
	`phase` text NOT NULL,
	`client_instance_id` text,
	`status` text NOT NULL,
	`input_json` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`error_json` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lua_event_runs_unique_idx` ON `lua_event_runs` (`conversation_id`,`event_key`,`phase`);--> statement-breakpoint
CREATE TABLE `lua_invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_run_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`script_revision` integer NOT NULL,
	`sequence` integer NOT NULL,
	`status` text NOT NULL,
	`result_json` text,
	`warnings_json` text DEFAULT '[]' NOT NULL,
	`error_json` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`event_run_id`) REFERENCES `lua_event_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lua_invocations_unique_idx` ON `lua_invocations` (`event_run_id`,`owner_type`,`owner_id`,`script_revision`);--> statement-breakpoint
CREATE TABLE `lua_remote_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`invocation_id` text NOT NULL,
	`call_index` integer NOT NULL,
	`client_instance_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`result_json` text,
	`status` text NOT NULL,
	`blocking` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`invocation_id`) REFERENCES `lua_invocations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lua_remote_commands_unique_idx` ON `lua_remote_commands` (`invocation_id`,`call_index`);--> statement-breakpoint
CREATE INDEX `lua_remote_commands_client_idx` ON `lua_remote_commands` (`client_instance_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `lua_states` (
	`conversation_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`state_key` text NOT NULL,
	`value_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	PRIMARY KEY(`conversation_id`, `owner_type`, `owner_id`, `state_key`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`position` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_conversation_position_idx` ON `messages` (`conversation_id`,`position`);--> statement-breakpoint
CREATE TABLE `model_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`credential_type` text NOT NULL,
	`hint` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `model_chain_agent_memories` (
	`conversation_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	PRIMARY KEY(`conversation_id`, `agent_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `model_chain_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`config_json` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `model_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider_json` text NOT NULL,
	`api_key_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `model_api_keys`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`avatar_asset_id` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`avatar_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `prompt_module_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`extension` text NOT NULL,
	`source_uri` text NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `prompt_modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `prompt_module_assets_module_idx` ON `prompt_module_assets` (`module_id`);--> statement-breakpoint
CREATE TABLE `prompt_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`namespace` text NOT NULL,
	`source_id` text DEFAULT '' NOT NULL,
	`runtime_order` integer DEFAULT 0 NOT NULL,
	`lua_code` text,
	`lua_enabled` integer DEFAULT false NOT NULL,
	`lua_low_level_access` integer DEFAULT false NOT NULL,
	`lua_revision` integer DEFAULT 0 NOT NULL,
	`lua_code_sha256` text DEFAULT '' NOT NULL,
	`lua_raw_trigger_json` text DEFAULT '[]' NOT NULL,
	`enabled_by_default` integer DEFAULT false NOT NULL,
	`prompts_json` text NOT NULL,
	`toggles_json` text NOT NULL,
	`regex_scripts_json` text DEFAULT '[]' NOT NULL,
	`background_embedding` text DEFAULT '' NOT NULL,
	`lorebook_json` text DEFAULT '[]' NOT NULL,
	`warnings_json` text NOT NULL,
	`source_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_modules_namespace_idx` ON `prompt_modules` (`namespace`) WHERE "prompt_modules"."namespace" <> '';--> statement-breakpoint
CREATE TABLE `prompt_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`blocks_json` text NOT NULL,
	`parameters_json` text NOT NULL,
	`default_variables_json` text NOT NULL,
	`toggles_json` text DEFAULT '[]' NOT NULL,
	`regex_scripts_json` text DEFAULT '[]' NOT NULL,
	`module_integrations_json` text DEFAULT '[]' NOT NULL,
	`prompt_settings_json` text DEFAULT '{"assistantPrefill":"","postEndInnerFormat":"","sendChatAsSystem":false,"sendName":false,"trimStartNewChat":false,"groupTemplate":""}' NOT NULL,
	`warnings_json` text NOT NULL,
	`source_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_debug_records` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`parameters_json` text NOT NULL,
	`request_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `request_debug_records_created_at_idx` ON `request_debug_records` ("created_at" desc);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_idx` ON `sessions` (`token_hash`);
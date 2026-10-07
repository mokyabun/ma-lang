CREATE TABLE `conversation_illustration_settings` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`mode` text NOT NULL,
	`count_min` integer NOT NULL,
	`count_max` integer NOT NULL,
	`style_id` text,
	`analysis_model_preset_id` text,
	`scene_direction` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`style_id`) REFERENCES `illustration_styles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `illustration_actors` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text,
	`persona_id` text,
	`name` text NOT NULL,
	`keys_json` text DEFAULT '[]' NOT NULL,
	`prompt_template` text NOT NULL,
	`negative` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "illustration_actors_one_owner" CHECK(("illustration_actors"."character_id" IS NULL) <> ("illustration_actors"."persona_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `illustration_actors_character_idx` ON `illustration_actors` (`character_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `illustration_actors_persona_idx` ON `illustration_actors` (`persona_id`) WHERE "illustration_actors"."persona_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `illustration_outfits` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`conversation_id` text,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`negative` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `illustration_actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `illustration_outfits_actor_idx` ON `illustration_outfits` (`actor_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `illustration_outfits_conversation_idx` ON `illustration_outfits` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `illustration_styles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`scene_template` text NOT NULL,
	`negative` text NOT NULL,
	`params_json` text DEFAULT '{}' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `analysis_model_preset_id` text;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `default_style_id` text;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `default_mode` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `default_count_min` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `default_count_max` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `context_message_count` integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `analysis_instruction` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `fixed_positive` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `fixed_negative` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `size_presets_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `illustration_settings` ADD `continuity_tracking` text DEFAULT 'with-illustration' NOT NULL;
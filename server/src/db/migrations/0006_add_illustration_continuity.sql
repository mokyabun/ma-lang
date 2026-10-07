CREATE TABLE `illustration_state_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`instruction` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`tags` text DEFAULT '' NOT NULL,
	`options_json` text DEFAULT '[]' NOT NULL,
	`thresholds_json` text DEFAULT '[]' NOT NULL,
	`lifetime_turns` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `illustration_state_definitions_character_idx` ON `illustration_state_definitions` (`character_id`);--> statement-breakpoint
CREATE TABLE `illustration_state_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`generation_run_id` text,
	`state_json` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `illustration_state_snapshots_conversation_idx` ON `illustration_state_snapshots` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `illustration_state_snapshots_message_idx` ON `illustration_state_snapshots` (`message_id`);
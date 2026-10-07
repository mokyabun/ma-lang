CREATE TABLE `illustration_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`illustration_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`seed` integer NOT NULL,
	`request_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`illustration_id`) REFERENCES `message_illustrations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `illustration_revisions_illustration_idx` ON `illustration_revisions` (`illustration_id`);--> statement-breakpoint
CREATE TABLE `message_illustrations` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`generation_run_id` text,
	`slot_index` integer NOT NULL,
	`status` text NOT NULL,
	`plan_json` text NOT NULL,
	`positive` text NOT NULL,
	`negative` text NOT NULL,
	`char_captions_json` text NOT NULL,
	`params_json` text NOT NULL,
	`active_revision_id` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `message_illustrations_message_idx` ON `message_illustrations` (`message_id`,`slot_index`);--> statement-breakpoint
CREATE INDEX `message_illustrations_conversation_idx` ON `message_illustrations` (`conversation_id`);
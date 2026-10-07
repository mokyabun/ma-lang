CREATE TABLE `background_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer NOT NULL,
	`run_after` integer NOT NULL,
	`locked_at` integer,
	`result_json` text,
	`error_json` text,
	`conversation_id` text,
	`message_id` text,
	`created_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `background_jobs_ready_idx` ON `background_jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE INDEX `background_jobs_conversation_idx` ON `background_jobs` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `background_jobs_message_idx` ON `background_jobs` (`message_id`);--> statement-breakpoint
CREATE TABLE `illustration_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`image_provider` text DEFAULT 'novelai' NOT NULL,
	`novelai_endpoint` text NOT NULL,
	`novelai_api_key_secret` text,
	`novelai_api_key_hint` text DEFAULT '' NOT NULL,
	`default_image_params_json` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsecond') * 1000) NOT NULL
);

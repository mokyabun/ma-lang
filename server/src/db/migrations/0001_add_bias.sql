ALTER TABLE `characters` ADD `bias_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `prompt_presets` ADD `bias_json` text DEFAULT '[]' NOT NULL;
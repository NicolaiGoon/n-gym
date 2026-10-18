ALTER TABLE `exercises` ADD `library_id` text;--> statement-breakpoint
ALTER TABLE `exercises` ADD `primary_muscles` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `exercises` ADD `secondary_muscles` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_library_id_unique` ON `exercises` (`library_id`);
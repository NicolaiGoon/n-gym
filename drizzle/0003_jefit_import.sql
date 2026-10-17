CREATE TABLE `body_measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`measured_at` integer NOT NULL,
	`weight` real,
	`body_fat` real,
	`measurements` text,
	`source` text DEFAULT 'app' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `exercises` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `external_id` text;
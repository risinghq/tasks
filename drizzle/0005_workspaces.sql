DELETE FROM `labels` WHERE `user_id` IN (
	SELECT `id` FROM `users` WHERE `email` IS NULL
		AND NOT EXISTS (SELECT 1 FROM `cards` WHERE `user_id` = `users`.`id`)
		AND NOT EXISTS (SELECT 1 FROM `api_tokens` WHERE `user_id` = `users`.`id`));--> statement-breakpoint
DELETE FROM `users` WHERE `email` IS NULL
	AND NOT EXISTS (SELECT 1 FROM `cards` WHERE `user_id` = `users`.`id`)
	AND NOT EXISTS (SELECT 1 FROM `labels` WHERE `user_id` = `users`.`id`)
	AND NOT EXISTS (SELECT 1 FROM `api_tokens` WHERE `user_id` = `users`.`id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`report_token` text DEFAULT (lower(hex(randomblob(32)))) NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_report_token_unique` ON `workspaces` (`report_token`);--> statement-breakpoint
INSERT INTO `workspaces` (`id`, `name`, `report_token`, `created_at`)
SELECT `id`, 'Personal', `report_token`, unixepoch() FROM `users`;--> statement-breakpoint
CREATE TABLE `__new_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "color_known" CHECK("__new_labels"."color" in ('green', 'yellow', 'orange', 'red', 'purple', 'blue'))
);
--> statement-breakpoint
INSERT INTO `__new_labels` (`id`, `workspace_id`, `name`, `color`)
SELECT `id`, `user_id`, `name`, `color` FROM `labels`;--> statement-breakpoint
CREATE TABLE `__new_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`label_id` text,
	`requester` text,
	`checklist` text DEFAULT '[]' NOT NULL,
	`list` text NOT NULL,
	`position` integer NOT NULL,
	`done_date` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `__new_labels`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "done_date_iff_hecho" CHECK(("__new_cards"."list" = 'hecho') = ("__new_cards"."done_date" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_cards` (`id`, `workspace_id`, `title`, `description`, `label_id`, `requester`, `checklist`, `list`, `position`, `done_date`)
SELECT `id`, `user_id`, `title`, `description`, `label_id`, `requester`, `checklist`, `list`, `position`, `done_date` FROM `cards`;--> statement-breakpoint
CREATE TABLE `__new_api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_tokens` (`id`, `user_id`, `workspace_id`, `name`, `token_hash`, `created_at`, `last_used_at`)
SELECT `id`, `user_id`, `user_id`, `name`, `token_hash`, `created_at`, `last_used_at` FROM `api_tokens`;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`session_version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "email_lowercase" CHECK("__new_users"."email" = lower("__new_users"."email"))
);
--> statement-breakpoint
INSERT INTO `__new_users` (`id`, `email`, `name`, `session_version`)
SELECT `id`, `email`, `name`, `session_version` FROM `users`;--> statement-breakpoint
DROP TABLE `cards`;--> statement-breakpoint
DROP TABLE `labels`;--> statement-breakpoint
DROP TABLE `api_tokens`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_labels` RENAME TO `labels`;--> statement-breakpoint
ALTER TABLE `__new_cards` RENAME TO `cards`;--> statement-breakpoint
ALTER TABLE `__new_api_tokens` RENAME TO `api_tokens`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `labels_workspace_name` ON `labels` (`workspace_id`,`name`);--> statement-breakpoint
CREATE INDEX `cards_group` ON `cards` (`workspace_id`,`list`,`done_date`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_user` ON `api_tokens` (`user_id`,`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_role_known" CHECK("workspace_members"."role" in ('owner', 'member'))
);
--> statement-breakpoint
CREATE INDEX `workspace_members_user` ON `workspace_members` (`user_id`);--> statement-breakpoint
INSERT INTO `workspace_members` (`workspace_id`, `user_id`, `role`)
SELECT `id`, `id`, 'owner' FROM `workspaces`;

CREATE TABLE `report_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`token` text DEFAULT (lower(hex(randomblob(32)))) NOT NULL,
	`label_id` text,
	`member_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "report_links_one_scope" CHECK("report_links"."label_id" is null or "report_links"."member_id" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_links_token_unique` ON `report_links` (`token`);--> statement-breakpoint
CREATE INDEX `report_links_workspace` ON `report_links` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_links_whole` ON `report_links` (`workspace_id`) WHERE "report_links"."label_id" is null and "report_links"."member_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `report_links_label` ON `report_links` (`label_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_links_member` ON `report_links` (`workspace_id`,`member_id`);--> statement-breakpoint
DROP INDEX `workspaces_report_token_unique`;--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `report_token`;--> statement-breakpoint
-- drizzle-kit drops the ON DELETE clause from an added column.
ALTER TABLE `cards` ADD `assignee_id` text REFERENCES users(id) ON DELETE set null;
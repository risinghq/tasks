CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`author_id` text,
	`created_at` integer NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`file_name` text,
	`file_type` text,
	`file_size` integer,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notes_not_empty" CHECK("notes"."text" <> '' or "notes"."file_name" is not null)
);
--> statement-breakpoint
CREATE INDEX `notes_card` ON `notes` (`card_id`,`created_at`);
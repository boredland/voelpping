CREATE TABLE `menus` (
	`week_start` text PRIMARY KEY NOT NULL,
	`image_url` text NOT NULL,
	`tuesday` text,
	`wednesday` text,
	`thursday` text,
	`friday` text,
	`raw_ocr` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`weekdays` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_chat_id_unique` ON `subscribers` (`chat_id`);
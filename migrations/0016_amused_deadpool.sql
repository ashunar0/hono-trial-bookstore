CREATE TABLE `return_windows` (
	`order_id` text PRIMARY KEY NOT NULL,
	`points_closed_at` integer,
	`points_earned_at` integer,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `return_windows_closed` ON `return_windows` (`points_closed_at`);--> statement-breakpoint
-- Orders already closed carry their points over to the window (version 1: its first move was the close)
INSERT INTO `return_windows` (`order_id`, `points_closed_at`, `points_earned_at`, `version`, `updated_at`)
SELECT `id`, `points_closed_at`, `points_earned_at`, 1, `points_closed_at` FROM `orders` WHERE `points_closed_at` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` DROP COLUMN `points_closed_at`;--> statement-breakpoint
ALTER TABLE `orders` DROP COLUMN `points_earned_at`;
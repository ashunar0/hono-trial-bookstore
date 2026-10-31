DROP INDEX `return_windows_closed`;--> statement-breakpoint
ALTER TABLE `return_windows` ADD `shipped_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `return_windows` ADD `earn_id` text;--> statement-breakpoint
UPDATE `return_windows` SET `shipped_at` = (SELECT `shipped_at` FROM `orders` WHERE `orders`.`id` = `return_windows`.`order_id`), `earn_id` = (SELECT `earn_id` FROM `orders` WHERE `orders`.`id` = `return_windows`.`order_id`);--> statement-breakpoint
INSERT INTO `return_windows` (`order_id`, `shipped_at`, `earn_id`, `version`, `updated_at`) SELECT `id`, `shipped_at`, `earn_id`, 1, `shipped_at` FROM `orders` WHERE `status` = 'shipped' AND `shipped_at` IS NOT NULL AND `id` NOT IN (SELECT `order_id` FROM `return_windows`);--> statement-breakpoint
CREATE INDEX `return_windows_closed` ON `return_windows` (`points_closed_at`,`shipped_at`);

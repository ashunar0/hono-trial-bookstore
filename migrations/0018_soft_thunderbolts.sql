ALTER TABLE `refunds` ADD `exchange_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_exchange_id_unique` ON `refunds` (`exchange_id`);
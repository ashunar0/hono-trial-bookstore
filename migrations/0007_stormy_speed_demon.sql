CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`return_id` text,
	`amount` integer NOT NULL,
	`tax` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_return_id_unique` ON `refunds` (`return_id`);
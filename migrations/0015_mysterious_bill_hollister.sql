CREATE TABLE `stock_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`book_id` text NOT NULL,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_alerts_attempts" CHECK("stock_alerts"."attempts" between 0 and 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_alerts_open` ON `stock_alerts` (`customer_id`,`book_id`) WHERE status in ('waiting', 'sending');--> statement-breakpoint
CREATE INDEX `stock_alerts_customer_created_at` ON `stock_alerts` (`customer_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `stock_alerts_status` ON `stock_alerts` (`status`,`created_at`);
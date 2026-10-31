CREATE TABLE `exchange_lines` (
	`exchange_id` text NOT NULL,
	`order_line_id` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`exchange_id`, `order_line_id`),
	FOREIGN KEY (`exchange_id`) REFERENCES `exchanges`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "exchange_lines_quantity_positive" CHECK("exchange_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE `exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`reject_reason` text,
	`requested_at` integer NOT NULL,
	`received_at` integer,
	`shipped_at` integer,
	`rejected_at` integer,
	`restored_at` integer,
	`version` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `exchanges_order` ON `exchanges` (`order_id`);--> statement-breakpoint
CREATE INDEX `exchanges_requested_at` ON `exchanges` (`requested_at`,`id`);--> statement-breakpoint
CREATE INDEX `exchanges_customer_requested_at` ON `exchanges` (`customer_id`,`requested_at`,`id`);
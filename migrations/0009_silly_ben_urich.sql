CREATE TABLE `restock_lines` (
	`restock_id` text NOT NULL,
	`book_id` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`restock_id`, `book_id`),
	FOREIGN KEY (`restock_id`) REFERENCES `restocks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "restock_lines_quantity_positive" CHECK("restock_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE `restocks` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `return_lines` (
	`return_id` text NOT NULL,
	`order_line_id` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`return_id`, `order_line_id`),
	FOREIGN KEY (`return_id`) REFERENCES `returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "return_lines_quantity_positive" CHECK("return_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE `returns` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`status` text NOT NULL,
	`reject_reason` text,
	`requested_at` integer NOT NULL,
	`completed_at` integer,
	`rejected_at` integer,
	`stock_returned_at` integer,
	`version` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `returns_order` ON `returns` (`order_id`);--> statement-breakpoint
CREATE INDEX `returns_requested_at` ON `returns` (`requested_at`,`id`);
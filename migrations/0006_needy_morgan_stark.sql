CREATE TABLE `coupon_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`coupon_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`used_at` integer NOT NULL,
	`released_at` integer,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_uses_once` ON `coupon_uses` (`coupon_id`,`customer_id`) WHERE status = 'used';--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`book_id` text NOT NULL,
	`title` text NOT NULL,
	`unit_price` integer NOT NULL,
	`quantity` integer NOT NULL,
	`discount` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_lines_quantity_positive" CHECK("order_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `order_lines_order` ON `order_lines` (`order_id`,`position`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`subtotal` integer NOT NULL,
	`discount` integer NOT NULL,
	`shipping_fee` integer NOT NULL,
	`total` integer NOT NULL,
	`tax` integer NOT NULL,
	`coupon_id` text,
	`coupon_code` text,
	`reservation_id` text NOT NULL,
	`coupon_use_id` text,
	`payment_due_at` integer NOT NULL,
	`paid_at` integer,
	`shipped_at` integer,
	`cancelled_at` integer,
	`released_at` integer,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "orders_total" CHECK("orders"."total" = "orders"."subtotal" - "orders"."discount" + "orders"."shipping_fee")
);
--> statement-breakpoint
CREATE INDEX `orders_customer_created_at` ON `orders` (`customer_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `orders_created_at` ON `orders` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `reservation_lines` (
	`reservation_id` text NOT NULL,
	`book_id` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`reservation_id`, `book_id`),
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reservation_lines_quantity_positive" CHECK("reservation_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`released_at` integer
);

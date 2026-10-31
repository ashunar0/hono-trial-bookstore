CREATE TABLE `point_balances` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`balance` integer NOT NULL,
	CONSTRAINT "point_balances_not_negative" CHECK("point_balances"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE `point_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "point_entries_amount_not_zero" CHECK("point_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE INDEX `point_entries_customer_created_at` ON `point_entries` (`customer_id`,`created_at`,`id`);
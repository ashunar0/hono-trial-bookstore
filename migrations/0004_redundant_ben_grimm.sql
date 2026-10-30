CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`min_subtotal` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`stopped_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "coupons_value_positive" CHECK("coupons"."value" > 0),
	CONSTRAINT "coupons_percent_at_most_100" CHECK("coupons"."kind" <> 'percent' or "coupons"."value" <= 100),
	CONSTRAINT "coupons_fixed_within_min" CHECK("coupons"."kind" <> 'fixed' or "coupons"."min_subtotal" >= "coupons"."value"),
	CONSTRAINT "coupons_ends_after_starts" CHECK("coupons"."ends_at" > "coupons"."starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);--> statement-breakpoint
CREATE INDEX `coupons_created_at` ON `coupons` (`created_at`,`id`);
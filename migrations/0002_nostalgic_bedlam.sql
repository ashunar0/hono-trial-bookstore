CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`price` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "books_price_positive" CHECK("books"."price" > 0)
);
--> statement-breakpoint
CREATE INDEX `books_created_at` ON `books` (`created_at`,`id`);
CREATE TABLE `stocks` (
	`book_id` text PRIMARY KEY NOT NULL,
	`quantity` integer NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stocks_quantity_not_negative" CHECK("stocks"."quantity" >= 0)
);

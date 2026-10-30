CREATE TABLE `cart_items` (
	`customer_id` text NOT NULL,
	`book_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`customer_id`, `book_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cart_items_quantity_positive" CHECK("cart_items"."quantity" > 0)
);

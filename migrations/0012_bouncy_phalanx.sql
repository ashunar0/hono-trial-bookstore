ALTER TABLE `orders` RENAME COLUMN "released_at" TO "restored_at";--> statement-breakpoint
ALTER TABLE `refunds` ADD `points_amount` integer DEFAULT 0 NOT NULL;
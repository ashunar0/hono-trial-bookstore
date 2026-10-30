/**
 * The tables of this app (drizzle). `pnpm db:generate` writes migrations from here.
 * Split into files when it grows, and point drizzle.config.ts's schema at them
 */
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export * from "./auth-schema";

export const booksTable = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    author: text("author").notNull(),
    /** Yen, tax included, a whole number */
    price: integer("price").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    check("books_price_positive", sql`${t.price} > 0`),
    // The list, newest first
    index("books_created_at").on(t.createdAt, t.id),
  ],
);

/**
 * Stock per book. A book with no row has none (0, version 0): the row is made the first time staff set the stock
 */
export const stocksTable = sqliteTable(
  "stocks",
  {
    bookId: text("book_id")
      .primaryKey()
      .references(() => booksTable.id),
    quantity: integer("quantity").notNull(),
    /** Counted up on every change, orders' too, so staff setting it from an old copy are turned away (STOCK_CHANGED) */
    version: integer("version").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [check("stocks_quantity_not_negative", sql`${t.quantity} >= 0`)],
);

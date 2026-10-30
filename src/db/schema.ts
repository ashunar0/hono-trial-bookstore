/**
 * The tables of this app (drizzle). `pnpm db:generate` writes migrations from here.
 * Split into files when it grows, and point drizzle.config.ts's schema at them
 */
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { couponKinds } from "#/domains/coupon/rules";

export * from "./auth-schema";

// ── book ──

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

// ── inventory ──

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

// ── coupon ──

export const couponsTable = sqliteTable(
  "coupons",
  {
    id: text("id").primaryKey(),
    /** In capitals (normalizeCode) */
    code: text("code").notNull().unique(),
    kind: text("kind", { enum: couponKinds }).notNull(),
    /** Yen off (fixed) or percent off (percent) */
    value: integer("value").notNull(),
    /** Yen the subtotal must reach. 0 is no condition */
    minSubtotal: integer("min_subtotal").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    /** Set once when staff stop it; it is never used again. Orders that used it stay as they are */
    stoppedAt: integer("stopped_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    check("coupons_value_positive", sql`${t.value} > 0`),
    check("coupons_percent_at_most_100", sql`${t.kind} <> 'percent' or ${t.value} <= 100`),
    check("coupons_fixed_within_min", sql`${t.kind} <> 'fixed' or ${t.minSubtotal} >= ${t.value}`),
    check("coupons_ends_after_starts", sql`${t.endsAt} > ${t.startsAt}`),
    // The list, newest first
    index("coupons_created_at").on(t.createdAt, t.id),
  ],
);

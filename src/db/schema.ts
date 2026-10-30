/**
 * The tables of this app (drizzle). `pnpm db:generate` writes migrations from here.
 * Split into files when it grows, and point drizzle.config.ts's schema at them
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { couponKinds } from "#/domains/coupon/rules";
import { orderStatuses } from "#/domains/order/rules";

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

/** Stock held for someone (an order), by an id the caller made. released once given back; never twice */
export const reservationsTable = sqliteTable("reservations", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["reserved", "released"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  releasedAt: integer("released_at", { mode: "timestamp_ms" }),
});

export const reservationLinesTable = sqliteTable(
  "reservation_lines",
  {
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservationsTable.id),
    bookId: text("book_id")
      .notNull()
      .references(() => booksTable.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.reservationId, t.bookId] }),
    check("reservation_lines_quantity_positive", sql`${t.quantity} > 0`),
  ],
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

/** A use of a coupon, by an id the caller made. released when an order is cancelled; a return keeps it */
export const couponUsesTable = sqliteTable(
  "coupon_uses",
  {
    id: text("id").primaryKey(),
    couponId: text("coupon_id")
      .notNull()
      .references(() => couponsTable.id),
    customerId: text("customer_id").notNull(),
    status: text("status", { enum: ["used", "released"] }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }).notNull(),
    releasedAt: integer("released_at", { mode: "timestamp_ms" }),
  },
  // One coupon once per customer, counting only the uses not given back
  (t) => [
    uniqueIndex("coupon_uses_once")
      .on(t.couponId, t.customerId)
      .where(sql`status = 'used'`),
  ],
);

// ── cart ──

/** One line per book. How many is set, not added to (PUT /cart/items/:bookId) */
export const cartItemsTable = sqliteTable(
  "cart_items",
  {
    customerId: text("customer_id").notNull(),
    bookId: text("book_id")
      .notNull()
      .references(() => booksTable.id),
    quantity: integer("quantity").notNull(),
    /** When it was first put in: the cart lists in that order */
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.customerId, t.bookId] }),
    check("cart_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

// ── order ──

export const ordersTable = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    status: text("status", { enum: orderStatuses }).notNull(),
    /** Yen, tax included. subtotal − discount + shippingFee = total */
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull(),
    shippingFee: integer("shipping_fee").notNull(),
    total: integer("total").notNull(),
    /** The tax within total */
    tax: integer("tax").notNull(),
    couponId: text("coupon_id"),
    /** As it was when placed */
    couponCode: text("coupon_code"),
    /** Made here before the stock is held, so a cancel can give it back whenever the placing stopped */
    reservationId: text("reservation_id").notNull(),
    /** The same, for the coupon. Null when no coupon */
    couponUseId: text("coupon_use_id"),
    paymentDueAt: integer("payment_due_at", { mode: "timestamp_ms" }).notNull(),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    shippedAt: integer("shipped_at", { mode: "timestamp_ms" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    /** When a cancel finished giving back the stock and the coupon. Null on a cancelled order: the cron finishes it */
    releasedAt: integer("released_at", { mode: "timestamp_ms" }),
    version: integer("version").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    check("orders_total", sql`${t.total} = ${t.subtotal} - ${t.discount} + ${t.shippingFee}`),
    // A customer's list and the staff's list, newest first
    index("orders_customer_created_at").on(t.customerId, t.createdAt, t.id),
    index("orders_created_at").on(t.createdAt, t.id),
    // What the cron picks up by status
    index("orders_status").on(t.status, t.paymentDueAt),
  ],
);

/** The books of an order, with the title and price copied as they were when placed */
export const orderLinesTable = sqliteTable(
  "order_lines",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id),
    bookId: text("book_id").notNull(),
    title: text("title").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    /** This line's share of the order's discount */
    discount: integer("discount").notNull(),
    /** The order of the lines as they were in the cart */
    position: integer("position").notNull(),
  },
  (t) => [
    check("order_lines_quantity_positive", sql`${t.quantity} > 0`),
    index("order_lines_order").on(t.orderId, t.position),
  ],
);

/** Money given back: a whole order on a cancel (returnId null), or the books of one return */
export const refundsTable = sqliteTable("refunds", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id),
  /** Null for a cancel. One refund per return */
  returnId: text("return_id").unique(),
  /** Yen, tax included */
  amount: integer("amount").notNull(),
  /** The tax within amount */
  tax: integer("tax").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

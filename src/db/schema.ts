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
import { pointKinds } from "#/domains/point/rules";
import { returnStatuses } from "#/domains/return/rules";
import { maxAttempts, stockAlertStatuses } from "#/domains/stock-alert/rules";

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

/** Stock put back from somewhere (a return), by its id: once per id */
export const restocksTable = sqliteTable("restocks", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const restockLinesTable = sqliteTable(
  "restock_lines",
  {
    restockId: text("restock_id")
      .notNull()
      .references(() => restocksTable.id),
    bookId: text("book_id")
      .notNull()
      .references(() => booksTable.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.restockId, t.bookId] }),
    check("restock_lines_quantity_positive", sql`${t.quantity} > 0`),
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

// ── point ──

/** A customer's points. A customer with no row has none (0): the row is made the first time points are added */
export const pointBalancesTable = sqliteTable(
  "point_balances",
  {
    customerId: text("customer_id").primaryKey(),
    balance: integer("balance").notNull(),
  },
  (t) => [check("point_balances_not_negative", sql`${t.balance} >= 0`)],
);

/**
 * Every change of the balance, by an id the caller made: once per id. amount is negative for a use
 */
export const pointEntriesTable = sqliteTable(
  "point_entries",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    kind: text("kind", { enum: pointKinds }).notNull(),
    amount: integer("amount").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    check("point_entries_amount_not_zero", sql`${t.amount} <> 0`),
    // A customer's statement, newest first
    index("point_entries_customer_created_at").on(t.customerId, t.createdAt, t.id),
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
    /** Points paid with, in yen. Part of the payment, not a discount: subtotal − discount + shippingFee = total still */
    pointsUsed: integer("points_used").notNull().default(0),
    /** The share of pointsUsed that went to the shipping fee. It does not come back on a return, as the fee does not */
    shippingPoints: integer("shipping_points").notNull().default(0),
    /** The same, for the points. Null when no points were used */
    pointUseId: text("point_use_id"),
    /** The id the points of this order are earned under, made here so an order earns once. Null on an order from before points */
    earnId: text("earn_id"),
    paymentDueAt: integer("payment_due_at", { mode: "timestamp_ms" }).notNull(),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    shippedAt: integer("shipped_at", { mode: "timestamp_ms" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    /** When a cancel finished giving back the stock, the coupon and the points. Null on a cancelled order: the cron finishes it */
    restoredAt: integer("restored_at", { mode: "timestamp_ms" }),
    /** When the points to earn were closed: the return period is over and no return is waiting. Set once */
    pointsClosedAt: integer("points_closed_at", { mode: "timestamp_ms" }),
    /** When the points were earned after closing. Null on a closed order: the cron finishes it */
    pointsEarnedAt: integer("points_earned_at", { mode: "timestamp_ms" }),
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
    /** This line's share of the points paid with */
    points: integer("points").notNull().default(0),
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
  /** The part of amount given back as points; the rest goes back to the card */
  pointsAmount: integer("points_amount").notNull().default(0),
  /** The tax within amount */
  tax: integer("tax").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

// ── return ──

/** A customer asks to send books back. Staff receive it (refund, stock back) or reject it */
export const returnsTable = sqliteTable(
  "returns",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id),
    status: text("status", { enum: returnStatuses }).notNull(),
    /** Why staff rejected it */
    rejectReason: text("reject_reason"),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    rejectedAt: integer("rejected_at", { mode: "timestamp_ms" }),
    /** When the stock and the points were put back after completing. Null on a completed return: the cron finishes it */
    restoredAt: integer("restored_at", { mode: "timestamp_ms" }),
    version: integer("version").notNull(),
  },
  (t) => [
    index("returns_order").on(t.orderId),
    index("returns_requested_at").on(t.requestedAt, t.id),
  ],
);

export const returnLinesTable = sqliteTable(
  "return_lines",
  {
    returnId: text("return_id")
      .notNull()
      .references(() => returnsTable.id),
    orderLineId: text("order_line_id")
      .notNull()
      .references(() => orderLinesTable.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.returnId, t.orderLineId] }),
    check("return_lines_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

// ── stock-alert ──

/**
 * "Tell me when this book is back". Its id is also the key of the mail, so a mail sent twice is one mail to the other
 * side. Cancelling deletes the row (only while waiting)
 */
export const stockAlertsTable = sqliteTable(
  "stock_alerts",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    bookId: text("book_id")
      .notNull()
      .references(() => booksTable.id),
    /** Where the mail goes: the customer's address when they asked, since the cron has no session to read it from */
    email: text("email").notNull(),
    status: text("status", { enum: stockAlertStatuses }).notNull(),
    /** How many times the mail was tried. Counted before the mail is called */
    attempts: integer("attempts").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    check(
      "stock_alerts_attempts",
      sql`${t.attempts} between 0 and ${sql.raw(String(maxAttempts))}`,
    ),
    // One alert still to be sent per customer and book. A sent or failed one does not count, so they can ask again
    uniqueIndex("stock_alerts_open")
      .on(t.customerId, t.bookId)
      .where(sql`status in ('waiting', 'sending')`),
    // A customer's list, newest first
    index("stock_alerts_customer_created_at").on(t.customerId, t.createdAt, t.id),
    // What the cron picks up by status
    index("stock_alerts_status").on(t.status, t.createdAt),
  ],
);

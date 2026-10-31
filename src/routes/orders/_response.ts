import { z } from "zod";
import type { orderLinesTable, ordersTable, refundsTable } from "#/db/schema";
import { orderStatuses } from "#/domains/order/rules";
import { returnResponseSchema } from "#/routes/returns/_response";

type OrderRow = typeof ordersTable.$inferSelect;
type LineRow = typeof orderLinesTable.$inferSelect;
type RefundRow = typeof refundsTable.$inferSelect;

const lineSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  /** As it was when placed */
  title: z.string(),
  unitPrice: z.number(),
  quantity: z.number(),
  /** This line's share of the order's discount */
  discount: z.number(),
  /** This line's share of the points paid with */
  points: z.number(),
});

/** A line of GET /orders. The hold, the coupon and point uses and when they were given back stay inside */
export const orderSummarySchema = z.object({
  id: z.string(),
  status: z.enum(orderStatuses),
  /** Send it back with POST /orders/:id/cancel */
  version: z.number(),
  subtotal: z.number(),
  discount: z.number(),
  shippingFee: z.number(),
  total: z.number(),
  tax: z.number(),
  couponCode: z.string().nullable(),
  /** Paid with points, in yen: part of the payment, not a discount. The card pays total − pointsUsed */
  pointsUsed: z.number(),
  paymentDueAt: z.string(),
  paidAt: z.string().nullable(),
  shippedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
});

const refundSchema = z.object({
  id: z.string(),
  /** null for a cancel */
  returnId: z.string().nullable(),
  amount: z.number(),
  /** The part of amount that went back as points; the card got the rest */
  points: z.number(),
  tax: z.number(),
});

/** GET /orders/:id, and what a write to an order returns */
export const orderResponseSchema = orderSummarySchema.extend({
  lines: z.array(lineSchema),
  returns: z.array(returnResponseSchema),
  refunds: z.array(refundSchema),
});

const iso = (at: Date | null) => at?.toISOString() ?? null;

export const orderSummary = (row: OrderRow): z.infer<typeof orderSummarySchema> => ({
  id: row.id,
  status: row.status,
  version: row.version,
  subtotal: row.subtotal,
  discount: row.discount,
  shippingFee: row.shippingFee,
  total: row.total,
  tax: row.tax,
  couponCode: row.couponCode,
  pointsUsed: row.pointsUsed,
  paymentDueAt: row.paymentDueAt.toISOString(),
  paidAt: iso(row.paidAt),
  shippedAt: iso(row.shippedAt),
  cancelledAt: iso(row.cancelledAt),
  createdAt: row.createdAt.toISOString(),
});

export const orderResponse = (
  row: OrderRow,
  lines: LineRow[],
  refunds: RefundRow[],
  returns: z.infer<typeof returnResponseSchema>[],
): z.infer<typeof orderResponseSchema> => ({
  ...orderSummary(row),
  lines: lines.map((line) => ({
    id: line.id,
    bookId: line.bookId,
    title: line.title,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    discount: line.discount,
    points: line.points,
  })),
  returns,
  refunds: refunds.map((refund) => ({
    id: refund.id,
    returnId: refund.returnId,
    amount: refund.amount,
    points: refund.pointsAmount,
    tax: refund.tax,
  })),
});

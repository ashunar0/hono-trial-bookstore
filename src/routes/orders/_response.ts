import { z } from "zod";
import type { orderLinesTable, ordersTable } from "#/db/schema";
import { orderStatuses } from "#/domains/order/rules";

type OrderRow = typeof ordersTable.$inferSelect;
type LineRow = typeof orderLinesTable.$inferSelect;

const lineSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  /** As it was when placed */
  title: z.string(),
  unitPrice: z.number(),
  quantity: z.number(),
  /** This line's share of the order's discount */
  discount: z.number(),
});

/** A line of GET /orders. The hold, the coupon use and when they were given back stay inside */
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
  paymentDueAt: z.string(),
  paidAt: z.string().nullable(),
  shippedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
});

/** GET /orders/:id, and what POST /orders returns */
export const orderResponseSchema = orderSummarySchema.extend({ lines: z.array(lineSchema) });

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
  paymentDueAt: row.paymentDueAt.toISOString(),
  paidAt: iso(row.paidAt),
  shippedAt: iso(row.shippedAt),
  cancelledAt: iso(row.cancelledAt),
  createdAt: row.createdAt.toISOString(),
});

export const orderResponse = (
  row: OrderRow,
  lines: LineRow[],
): z.infer<typeof orderResponseSchema> => ({
  ...orderSummary(row),
  lines: lines.map((line) => ({
    id: line.id,
    bookId: line.bookId,
    title: line.title,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    discount: line.discount,
  })),
});

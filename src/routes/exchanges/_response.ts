import { z } from "zod";
import type { exchangeLinesTable, exchangesTable } from "#/db/schema";
import { exchangeReasons, exchangeStatuses } from "#/domains/return/rules";

type ExchangeRow = typeof exchangesTable.$inferSelect;
type LineRow = typeof exchangeLinesTable.$inferSelect;

/** An exchange, in GET /exchanges, in an order's exchanges, and after a write */
export const exchangeResponseSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  reason: z.enum(exchangeReasons),
  status: z.enum(exchangeStatuses),
  /** Why staff rejected it */
  rejectReason: z.string().nullable(),
  requestedAt: z.string(),
  /** When staff got the damaged copies (received, or refunded when none was left) */
  receivedAt: z.string().nullable(),
  shippedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  lines: z.array(z.object({ orderLineId: z.string(), quantity: z.number() })),
});

export const exchangeResponse = (
  row: ExchangeRow,
  lines: LineRow[],
): z.infer<typeof exchangeResponseSchema> => ({
  id: row.id,
  orderId: row.orderId,
  reason: row.reason,
  status: row.status,
  rejectReason: row.rejectReason,
  requestedAt: row.requestedAt.toISOString(),
  receivedAt: row.receivedAt?.toISOString() ?? null,
  shippedAt: row.shippedAt?.toISOString() ?? null,
  rejectedAt: row.rejectedAt?.toISOString() ?? null,
  lines: lines
    .filter((line) => line.exchangeId === row.id)
    .map((line) => ({ orderLineId: line.orderLineId, quantity: line.quantity })),
});

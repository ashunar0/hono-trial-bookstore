import { z } from "zod";
import type { returnLinesTable, returnsTable } from "#/db/schema";
import { returnStatuses } from "#/domains/order/rules";

type ReturnRow = typeof returnsTable.$inferSelect;
type LineRow = typeof returnLinesTable.$inferSelect;

/** A return, in GET /returns, in an order's returns, and after a write */
export const returnResponseSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.enum(returnStatuses),
  /** Why staff rejected it */
  rejectReason: z.string().nullable(),
  requestedAt: z.string(),
  completedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  lines: z.array(z.object({ orderLineId: z.string(), quantity: z.number() })),
});

export const returnResponse = (
  row: ReturnRow,
  lines: LineRow[],
): z.infer<typeof returnResponseSchema> => ({
  id: row.id,
  orderId: row.orderId,
  status: row.status,
  rejectReason: row.rejectReason,
  requestedAt: row.requestedAt.toISOString(),
  completedAt: row.completedAt?.toISOString() ?? null,
  rejectedAt: row.rejectedAt?.toISOString() ?? null,
  lines: lines
    .filter((line) => line.returnId === row.id)
    .map((line) => ({ orderLineId: line.orderLineId, quantity: line.quantity })),
});

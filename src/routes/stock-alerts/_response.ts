import { z } from "zod";
import type { stockAlertsTable } from "#/db/schema";
import { stockAlertStatuses } from "#/domains/stock-alert/rules";

type AlertRow = typeof stockAlertsTable.$inferSelect;

/** One alert: POST /books/:id/stock-alerts and a line of GET /stock-alerts */
export const alertResponseSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  status: z.enum(stockAlertStatuses),
  createdAt: z.string(),
  /** When the mail went; null until then, and for one that could not be sent */
  sentAt: z.string().nullable(),
});

export const alertResponse = (row: AlertRow): z.infer<typeof alertResponseSchema> => ({
  id: row.id,
  bookId: row.bookId,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  sentAt: row.sentAt?.toISOString() ?? null,
});

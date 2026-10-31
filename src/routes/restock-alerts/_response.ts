import { z } from "zod";
import type { restockAlertsTable } from "#/db/schema";
import { restockAlertStatuses } from "#/domains/restock/rules";

type AlertRow = typeof restockAlertsTable.$inferSelect;

/** One alert: POST /books/:id/restock-alerts and a line of GET /restock-alerts */
export const alertResponseSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  status: z.enum(restockAlertStatuses),
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

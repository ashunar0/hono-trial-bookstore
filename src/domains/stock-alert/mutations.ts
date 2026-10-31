import { and, eq, sql } from "drizzle-orm";
import type { Db } from "#/db/index";
import { stockAlertsTable } from "#/db/schema";

export const insertAlert = (db: Db, row: typeof stockAlertsTable.$inferInsert) =>
  db.insert(stockAlertsTable).values(row).returning();

/** No row back when the alert is not waiting any more (sending by the cron, or already cancelled) */
export const deleteWaitingAlert = (db: Db, id: string) =>
  db
    .delete(stockAlertsTable)
    .where(and(eq(stockAlertsTable.id, id), eq(stockAlertsTable.status, "waiting")))
    .returning();

/**
 * Starts a try: sending, one more attempt. Only while the alert is as it was read (status and attempts), so of two
 * runs that read the same alert one wins. No row back for the one that lost
 */
export const startAttempt = (
  db: Db,
  at: { id: string; status: "waiting" | "sending"; attempts: number },
) =>
  db
    .update(stockAlertsTable)
    .set({ status: "sending", attempts: sql`${stockAlertsTable.attempts} + 1` })
    .where(
      and(
        eq(stockAlertsTable.id, at.id),
        eq(stockAlertsTable.status, at.status),
        eq(stockAlertsTable.attempts, at.attempts),
      ),
    )
    .returning();

/** Ends a sending alert, as sent (with when) or failed. Only while it is sending */
export const finishAlert = (
  db: Db,
  id: string,
  values: { status: "sent"; sentAt: Date } | { status: "failed" },
) =>
  db
    .update(stockAlertsTable)
    .set(values)
    .where(and(eq(stockAlertsTable.id, id), eq(stockAlertsTable.status, "sending")))
    .returning();

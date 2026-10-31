import { and, eq, sql } from "drizzle-orm";
import type { Db } from "#/db/index";
import { restockAlertsTable } from "#/db/schema";

export const insertAlert = (db: Db, row: typeof restockAlertsTable.$inferInsert) =>
  db.insert(restockAlertsTable).values(row).returning();

/** No row back when the alert is not waiting any more (sending by the cron, or already cancelled) */
export const deleteWaitingAlert = (db: Db, id: string) =>
  db
    .delete(restockAlertsTable)
    .where(and(eq(restockAlertsTable.id, id), eq(restockAlertsTable.status, "waiting")))
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
    .update(restockAlertsTable)
    .set({ status: "sending", attempts: sql`${restockAlertsTable.attempts} + 1` })
    .where(
      and(
        eq(restockAlertsTable.id, at.id),
        eq(restockAlertsTable.status, at.status),
        eq(restockAlertsTable.attempts, at.attempts),
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
    .update(restockAlertsTable)
    .set(values)
    .where(and(eq(restockAlertsTable.id, id), eq(restockAlertsTable.status, "sending")))
    .returning();

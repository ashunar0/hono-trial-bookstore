import { and, eq, isNull } from "drizzle-orm";
import { updateWithVersion } from "hono-kit/sqlite";
import type { Db } from "#/db/index";
import { orderLinesTable, ordersTable, refundsTable } from "#/db/schema";

type OrderRow = typeof ordersTable.$inferInsert;
type LineRow = typeof orderLinesTable.$inferInsert;

/** The order and its lines. Run in one batch */
export const insertOrder = (db: Db, order: OrderRow, lines: LineRow[]) =>
  [db.insert(ordersTable).values(order), db.insert(orderLinesTable).values(lines)] as const;

/** An order whose placing failed, as if it had never been. Run in one batch */
export const deleteOrder = (db: Db, id: string) =>
  [
    db.delete(orderLinesTable).where(eq(orderLinesTable.orderId, id)),
    db.delete(ordersTable).where(eq(ordersTable.id, id)),
  ] as const;

/** No row back when the version is no longer the one read */
export const updateOrder = (
  db: Db,
  at: { id: string; version: number },
  values: Partial<Omit<OrderRow, "id" | "version">>,
) => updateWithVersion(db, ordersTable, at, values);

/**
 * Its id is fixed by what it refunds (refundIdOf), so running it again adds nothing:
 * a cancel or a receive that stopped halfway is finished by running it again
 */
export const insertRefund = (db: Db, row: typeof refundsTable.$inferInsert) =>
  db.insert(refundsTable).values(row).onConflictDoNothing();

/** Records that a cancel gave everything back. Not a change the customer sees, so the version stays */
export const markRestored = (db: Db, id: string, at: Date) =>
  db
    .update(ordersTable)
    .set({ restoredAt: at })
    .where(and(eq(ordersTable.id, id), isNull(ordersTable.restoredAt)));

/** Records that the points of a closed order are earned. Not a change anyone sees, so the version stays */
export const markPointsEarned = (db: Db, id: string, at: Date) =>
  db
    .update(ordersTable)
    .set({ pointsEarnedAt: at })
    .where(and(eq(ordersTable.id, id), isNull(ordersTable.pointsEarnedAt)));

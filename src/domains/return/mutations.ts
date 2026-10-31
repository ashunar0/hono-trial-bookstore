import { and, eq, isNull } from "drizzle-orm";
import { updateWithVersion } from "hono-kit/sqlite";
import type { Db } from "#/db/index";
import {
  exchangeLinesTable,
  exchangesTable,
  returnLinesTable,
  returnsTable,
  returnWindowsTable,
} from "#/db/schema";

/** The return and its lines. Run in one batch */
export const insertReturn = (
  db: Db,
  row: typeof returnsTable.$inferInsert,
  lines: (typeof returnLinesTable.$inferInsert)[],
) => [db.insert(returnsTable).values(row), db.insert(returnLinesTable).values(lines)] as const;

/** No row back when the version is no longer the one read */
export const updateReturn = (
  db: Db,
  at: { id: string; version: number },
  values: Partial<Omit<typeof returnsTable.$inferInsert, "id" | "version">>,
) => updateWithVersion(db, returnsTable, at, values);

/** Records that a completed return's stock and points are back. Not a change anyone sees, so the version stays */
export const markReturnRestored = (db: Db, id: string, at: Date) =>
  db
    .update(returnsTable)
    .set({ restoredAt: at })
    .where(and(eq(returnsTable.id, id), isNull(returnsTable.restoredAt)));

type WindowRow = typeof returnWindowsTable.$inferInsert;

/** No row back when the order already has one (made by someone else in between) */
export const insertWindow = (db: Db, row: WindowRow) =>
  db.insert(returnWindowsTable).values(row).onConflictDoNothing().returning();

/** No row back when the version is no longer the one read */
export const updateWindow = (
  db: Db,
  at: { orderId: string; version: number },
  values: Partial<Omit<WindowRow, "orderId" | "version">>,
) => updateWithVersion(db, returnWindowsTable, at, values);

/** Records that a closed window's points are earned. Not a change anyone sees, so the version stays */
export const markPointsEarned = (db: Db, orderId: string, at: Date) =>
  db
    .update(returnWindowsTable)
    .set({ pointsEarnedAt: at })
    .where(and(eq(returnWindowsTable.orderId, orderId), isNull(returnWindowsTable.pointsEarnedAt)));

/** The exchange and its lines. Run in one batch */
export const insertExchange = (
  db: Db,
  row: typeof exchangesTable.$inferInsert,
  lines: (typeof exchangeLinesTable.$inferInsert)[],
) => [db.insert(exchangesTable).values(row), db.insert(exchangeLinesTable).values(lines)] as const;

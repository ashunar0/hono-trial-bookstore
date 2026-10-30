import { and, eq, sql } from "drizzle-orm";
import type { Db } from "#/db/index";
import { stocksTable } from "#/db/schema";

/** No row back when the book already has one (made by someone else in between) */
export const insertStock = (db: Db, row: typeof stocksTable.$inferInsert) =>
  db.insert(stocksTable).values(row).onConflictDoNothing().returning();

/**
 * No row back when the version is no longer the one read.
 * By hand, not updateWithVersion: that needs an `id` column, and this table's key is the book's id
 */
export const updateStock = (
  db: Db,
  at: { bookId: string; version: number },
  values: { quantity: number; updatedAt: Date },
) =>
  db
    .update(stocksTable)
    .set({ ...values, version: sql`${stocksTable.version} + 1` })
    .where(and(eq(stocksTable.bookId, at.bookId), eq(stocksTable.version, at.version)))
    .returning();

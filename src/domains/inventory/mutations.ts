import { and, eq, exists, sql } from "drizzle-orm";
import type { Db } from "#/db/index";
import { reservationLinesTable, reservationsTable, stocksTable } from "#/db/schema";

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

type Held = { bookId: string; quantity: number };

/**
 * Holds the stock: the hold, its lines, and each stock taken down. Run in one batch: a stock that would go below 0
 * fails its CHECK and nothing is written. A hold already made with this id fails the primary key the same way
 */
export const holdStock = (db: Db, at: { reservationId: string; now: Date }, lines: Held[]) =>
  [
    db
      .insert(reservationsTable)
      .values({ id: at.reservationId, status: "reserved", createdAt: at.now }),
    db
      .insert(reservationLinesTable)
      .values(lines.map((line) => ({ reservationId: at.reservationId, ...line }))),
    ...lines.map((line) =>
      db
        .update(stocksTable)
        .set({
          quantity: sql`${stocksTable.quantity} - ${line.quantity}`,
          version: sql`${stocksTable.version} + 1`,
          updatedAt: at.now,
        })
        .where(eq(stocksTable.bookId, line.bookId)),
    ),
  ] as const;

/**
 * Gives a hold back: adds its lines to the stock only while it is still reserved, then marks it released.
 * Run in one batch, in this order. A second run (or a hold never made) changes nothing
 */
export const giveBackHold = (db: Db, at: { reservationId: string; now: Date }) => {
  const stillReserved = exists(
    db
      .select({ id: reservationsTable.id })
      .from(reservationsTable)
      .where(
        and(eq(reservationsTable.id, at.reservationId), eq(reservationsTable.status, "reserved")),
      ),
  );
  const heldOf = (
    column: typeof reservationLinesTable.quantity | typeof reservationLinesTable.bookId,
  ) =>
    db
      .select({ value: column })
      .from(reservationLinesTable)
      .where(
        and(
          eq(reservationLinesTable.reservationId, at.reservationId),
          eq(reservationLinesTable.bookId, stocksTable.bookId),
        ),
      );
  return [
    db
      .update(stocksTable)
      .set({
        quantity: sql`${stocksTable.quantity} + (${heldOf(reservationLinesTable.quantity)})`,
        version: sql`${stocksTable.version} + 1`,
        updatedAt: at.now,
      })
      .where(and(exists(heldOf(reservationLinesTable.bookId)), stillReserved)),
    db
      .update(reservationsTable)
      .set({ status: "released", releasedAt: at.now })
      .where(
        and(eq(reservationsTable.id, at.reservationId), eq(reservationsTable.status, "reserved")),
      ),
  ] as const;
};

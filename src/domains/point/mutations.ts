import { eq, sql } from "drizzle-orm";
import type { Db } from "#/db/index";
import { pointBalancesTable, pointEntriesTable } from "#/db/schema";

/**
 * Writes an entry and moves the balance by its amount. Run in one batch, in this order: the entry first, so a second
 * run with the same id fails the primary key before anything else. Then the balance row is made if it is not there
 * (an UPDATE alone would find no row for a customer with none, and an entry would stay with no balance behind it),
 * then moved. A balance that would go below 0 fails its CHECK and nothing is written.
 * The row is made empty and then moved, not made with the amount in one INSERT ... ON CONFLICT DO UPDATE: SQLite checks
 * the CHECK on the row the INSERT proposes before it looks for the conflict, so a use (negative) of an existing
 * balance would fail even when the balance covers it
 */
export const writeEntry = (db: Db, row: typeof pointEntriesTable.$inferInsert) =>
  [
    db.insert(pointEntriesTable).values(row),
    db
      .insert(pointBalancesTable)
      .values({ customerId: row.customerId, balance: 0 })
      .onConflictDoNothing(),
    db
      .update(pointBalancesTable)
      .set({ balance: sql`${pointBalancesTable.balance} + ${row.amount}` })
      .where(eq(pointBalancesTable.customerId, row.customerId)),
  ] as const;

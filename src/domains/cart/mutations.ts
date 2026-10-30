import { and, eq } from "drizzle-orm";
import type { UserId } from "hono-kit";
import type { Db } from "#/db/index";
import { cartItemsTable } from "#/db/schema";

/** Puts the book in, or sets how many when it is already in (keeping when it was first put in) */
export const upsertCartItem = (db: Db, row: typeof cartItemsTable.$inferInsert) =>
  db
    .insert(cartItemsTable)
    .values(row)
    .onConflictDoUpdate({
      target: [cartItemsTable.customerId, cartItemsTable.bookId],
      set: { quantity: row.quantity },
    })
    .returning();

/** No row back when the book was not in the cart */
export const deleteCartItem = (db: Db, customerId: UserId, bookId: string) =>
  db
    .delete(cartItemsTable)
    .where(and(eq(cartItemsTable.customerId, customerId), eq(cartItemsTable.bookId, bookId)))
    .returning();

export const deleteCartOf = (db: Db, customerId: UserId) =>
  db.delete(cartItemsTable).where(eq(cartItemsTable.customerId, customerId));

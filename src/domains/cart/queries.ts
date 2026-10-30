import { asc, eq } from "drizzle-orm";
import type { UserId } from "hono-kit";
import type { Db } from "#/db/index";
import { cartItemsTable } from "#/db/schema";

/** In the order they were put in. A cart stays small, so it is not paged */
export const cartItemsOf = (db: Db, customerId: UserId) =>
  db
    .select()
    .from(cartItemsTable)
    .where(eq(cartItemsTable.customerId, customerId))
    .orderBy(asc(cartItemsTable.addedAt), asc(cartItemsTable.bookId));

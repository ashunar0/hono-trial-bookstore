import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "#/db/index";
import { couponsTable } from "#/db/schema";

export const insertCoupon = (db: Db, row: typeof couponsTable.$inferInsert) =>
  db.insert(couponsTable).values(row);

/** No row back when it was already stopped (or does not exist): the first stoppedAt stays */
export const markStopped = (db: Db, id: string, at: Date) =>
  db
    .update(couponsTable)
    .set({ stoppedAt: at })
    .where(and(eq(couponsTable.id, id), isNull(couponsTable.stoppedAt)))
    .returning();

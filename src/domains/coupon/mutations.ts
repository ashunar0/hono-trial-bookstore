import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "#/db/index";
import { couponsTable, couponUsesTable } from "#/db/schema";

export const insertCoupon = (db: Db, row: typeof couponsTable.$inferInsert) =>
  db.insert(couponsTable).values(row);

/** No row back when it was already stopped (or does not exist): the first stoppedAt stays */
export const markStopped = (db: Db, id: string, at: Date) =>
  db
    .update(couponsTable)
    .set({ stoppedAt: at })
    .where(and(eq(couponsTable.id, id), isNull(couponsTable.stoppedAt)))
    .returning();

export const insertCouponUse = (db: Db, row: typeof couponUsesTable.$inferInsert) =>
  db.insert(couponUsesTable).values(row);

/** Gives a use back. Run again, it changes nothing */
export const markUseReleased = (db: Db, id: string, at: Date) =>
  db
    .update(couponUsesTable)
    .set({ status: "released", releasedAt: at })
    .where(and(eq(couponUsesTable.id, id), eq(couponUsesTable.status, "used")));

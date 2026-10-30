import { and, desc, eq, lt, or } from "drizzle-orm";
import { toPage, type PageQuery } from "hono-kit/page";
import type { Db } from "#/db/index";
import { couponsTable } from "#/db/schema";
import { normalizeCode } from "./rules";

/** Newest first, stopped ones too */
export const listCoupons = async (db: Db, query: PageQuery) => {
  const { after, limit } = query;
  const rows = await db
    .select()
    .from(couponsTable)
    .where(
      after === undefined
        ? undefined
        : or(
            lt(couponsTable.createdAt, after.at),
            and(eq(couponsTable.createdAt, after.at), lt(couponsTable.id, after.id)),
          ),
    )
    .orderBy(desc(couponsTable.createdAt), desc(couponsTable.id))
    .limit(limit + 1);
  return toPage(rows, limit, (row) => ({ at: row.createdAt, id: row.id }));
};

export const findCoupon = async (db: Db, id: string) => {
  const [row] = await db.select().from(couponsTable).where(eq(couponsTable.id, id)).limit(1);
  return row;
};

/** `code` as the customer typed it */
export const findCouponByCode = async (db: Db, code: string) => {
  const [row] = await db
    .select()
    .from(couponsTable)
    .where(eq(couponsTable.code, normalizeCode(code)))
    .limit(1);
  return row;
};

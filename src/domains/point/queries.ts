import { and, desc, eq, lt, or } from "drizzle-orm";
import type { UserId } from "hono-kit";
import { toPage, type PageQuery } from "hono-kit/page";
import type { Db } from "#/db/index";
import { pointBalancesTable, pointEntriesTable } from "#/db/schema";

/** 0 for a customer who never had any */
export const balanceOf = async (db: Db, customerId: string) => {
  const [row] = await db
    .select()
    .from(pointBalancesTable)
    .where(eq(pointBalancesTable.customerId, customerId))
    .limit(1);
  return row?.balance ?? 0;
};

/** The customer's statement, newest first */
export const listEntries = async (db: Db, customerId: UserId, query: PageQuery) => {
  const { after, limit } = query;
  const rows = await db
    .select()
    .from(pointEntriesTable)
    .where(
      and(
        eq(pointEntriesTable.customerId, customerId),
        after === undefined
          ? undefined
          : or(
              lt(pointEntriesTable.createdAt, after.at),
              and(eq(pointEntriesTable.createdAt, after.at), lt(pointEntriesTable.id, after.id)),
            ),
      ),
    )
    .orderBy(desc(pointEntriesTable.createdAt), desc(pointEntriesTable.id))
    .limit(limit + 1);
  return toPage(rows, limit, (row) => ({ at: row.createdAt, id: row.id }));
};

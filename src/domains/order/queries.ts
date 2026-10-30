import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { UserId } from "hono-kit";
import { toPage, type PageQuery } from "hono-kit/page";
import type { Db } from "#/db/index";
import { orderLinesTable, ordersTable, refundsTable } from "#/db/schema";
import { visibleStatuses } from "./rules";

/** Any status, placing too: the caller decides what to show */
export const findOrder = async (db: Db, id: string) => {
  const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  return row;
};

export const linesOf = (db: Db, orderId: string) =>
  db
    .select()
    .from(orderLinesTable)
    .where(eq(orderLinesTable.orderId, orderId))
    .orderBy(asc(orderLinesTable.position));

/** Newest first, never placing. customerId narrows it to one customer's */
export const listOrders = async (
  db: Db,
  filter: { customerId?: UserId; status?: (typeof visibleStatuses)[number] },
  query: PageQuery,
) => {
  const { after, limit } = query;
  const rows = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        filter.customerId === undefined ? undefined : eq(ordersTable.customerId, filter.customerId),
        filter.status === undefined
          ? inArray(ordersTable.status, [...visibleStatuses])
          : eq(ordersTable.status, filter.status),
        after === undefined
          ? undefined
          : or(
              lt(ordersTable.createdAt, after.at),
              and(eq(ordersTable.createdAt, after.at), lt(ordersTable.id, after.id)),
            ),
      ),
    )
    .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id))
    .limit(limit + 1);
  return toPage(rows, limit, (row) => ({ at: row.createdAt, id: row.id }));
};

export const refundsOf = (db: Db, orderId: string) =>
  db
    .select()
    .from(refundsTable)
    .where(eq(refundsTable.orderId, orderId))
    .orderBy(asc(refundsTable.createdAt), asc(refundsTable.id));

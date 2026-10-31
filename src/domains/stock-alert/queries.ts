import { and, asc, desc, eq, inArray, lt, min, or } from "drizzle-orm";
import type { UserId } from "hono-kit";
import { toPage, type PageQuery } from "hono-kit/page";
import type { Db } from "#/db/index";
import { stockAlertsTable } from "#/db/schema";

const open = inArray(stockAlertsTable.status, ["waiting", "sending"]);

export const findAlert = async (db: Db, id: string) => {
  const [row] = await db
    .select()
    .from(stockAlertsTable)
    .where(eq(stockAlertsTable.id, id))
    .limit(1);
  return row;
};

/** The alert the customer still has on the book (waiting or sending), if any */
export const findOpenAlert = async (db: Db, customerId: UserId, bookId: string) => {
  const [row] = await db
    .select()
    .from(stockAlertsTable)
    .where(
      and(eq(stockAlertsTable.customerId, customerId), eq(stockAlertsTable.bookId, bookId), open),
    )
    .limit(1);
  return row;
};

/** The customer's alerts of every status, newest first */
export const listAlerts = async (db: Db, customerId: UserId, query: PageQuery) => {
  const { after, limit } = query;
  const rows = await db
    .select()
    .from(stockAlertsTable)
    .where(
      and(
        eq(stockAlertsTable.customerId, customerId),
        after === undefined
          ? undefined
          : or(
              lt(stockAlertsTable.createdAt, after.at),
              and(eq(stockAlertsTable.createdAt, after.at), lt(stockAlertsTable.id, after.id)),
            ),
      ),
    )
    .orderBy(desc(stockAlertsTable.createdAt), desc(stockAlertsTable.id))
    .limit(limit + 1);
  return toPage(rows, limit, (row) => ({ at: row.createdAt, id: row.id }));
};

/** The books somebody is waiting on, the one waited on longest first */
export const waitingBookIds = async (db: Db) => {
  const rows = await db
    .select({ bookId: stockAlertsTable.bookId })
    .from(stockAlertsTable)
    .where(eq(stockAlertsTable.status, "waiting"))
    .groupBy(stockAlertsTable.bookId)
    .orderBy(asc(min(stockAlertsTable.createdAt)));
  return rows.map((row) => row.bookId);
};

/** The waiting alerts on these books, oldest first */
export const waitingAlertsOf = (db: Db, bookIds: string[], limit: number) =>
  bookIds.length === 0
    ? Promise.resolve([])
    : db
        .select({ id: stockAlertsTable.id })
        .from(stockAlertsTable)
        .where(
          and(eq(stockAlertsTable.status, "waiting"), inArray(stockAlertsTable.bookId, bookIds)),
        )
        .orderBy(asc(stockAlertsTable.createdAt), asc(stockAlertsTable.id))
        .limit(limit);

/** Alerts whose mail was started and not finished, oldest first. Whether they are tried again or given up is the usecase's */
export const sendingAlerts = (db: Db, limit: number) =>
  db
    .select({ id: stockAlertsTable.id })
    .from(stockAlertsTable)
    .where(eq(stockAlertsTable.status, "sending"))
    .orderBy(asc(stockAlertsTable.createdAt), asc(stockAlertsTable.id))
    .limit(limit);

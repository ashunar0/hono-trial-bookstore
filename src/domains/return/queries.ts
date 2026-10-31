import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { toPage, type PageQuery } from "hono-kit/page";
import type { Db } from "#/db/index";
import { returnLinesTable, returnsTable, returnWindowsTable } from "#/db/schema";
import type { ReturnStatus } from "./rules";

export const findReturn = async (db: Db, id: string) => {
  const [row] = await db.select().from(returnsTable).where(eq(returnsTable.id, id)).limit(1);
  return row;
};

/** An order's returns, oldest first */
export const returnsOf = (db: Db, orderId: string) =>
  db
    .select()
    .from(returnsTable)
    .where(eq(returnsTable.orderId, orderId))
    .orderBy(asc(returnsTable.requestedAt), asc(returnsTable.id));

export const returnLinesOf = (db: Db, returnIds: string[]) =>
  returnIds.length === 0
    ? Promise.resolve([])
    : db.select().from(returnLinesTable).where(inArray(returnLinesTable.returnId, returnIds));

/**
 * Copies of each of the order's lines in its returns of these statuses. `excluding` leaves one return out.
 * Lines with none are missing
 */
export const returnedCopies = async (
  db: Db,
  orderId: string,
  statuses: ReturnStatus[],
  excluding?: string,
) => {
  const rows = await db
    .select({
      orderLineId: returnLinesTable.orderLineId,
      copies: sql<number>`sum(${returnLinesTable.quantity})`,
    })
    .from(returnLinesTable)
    .innerJoin(returnsTable, eq(returnsTable.id, returnLinesTable.returnId))
    .where(
      and(
        eq(returnsTable.orderId, orderId),
        inArray(returnsTable.status, statuses),
        excluding === undefined ? undefined : ne(returnsTable.id, excluding),
      ),
    )
    .groupBy(returnLinesTable.orderLineId);
  return new Map(rows.map((row) => [row.orderLineId, row.copies]));
};

/** Newest first. ?status=requested is what staff still have to decide */
export const listReturns = async (db: Db, filter: { status?: ReturnStatus }, query: PageQuery) => {
  const { after, limit } = query;
  const rows = await db
    .select()
    .from(returnsTable)
    .where(
      and(
        filter.status === undefined ? undefined : eq(returnsTable.status, filter.status),
        after === undefined
          ? undefined
          : or(
              lt(returnsTable.requestedAt, after.at),
              and(eq(returnsTable.requestedAt, after.at), lt(returnsTable.id, after.id)),
            ),
      ),
    )
    .orderBy(desc(returnsTable.requestedAt), desc(returnsTable.id))
    .limit(limit + 1);
  return toPage(rows, limit, (row) => ({ at: row.requestedAt, id: row.id }));
};

/** Completed returns whose stock and points were not put back yet (the cron finishes them), oldest first */
export const returnsToSweep = (db: Db, limit: number) =>
  db
    .select({ id: returnsTable.id })
    .from(returnsTable)
    .where(and(eq(returnsTable.status, "completed"), isNull(returnsTable.restoredAt)))
    .orderBy(asc(returnsTable.completedAt))
    .limit(limit);

/** Of these orders, the ones with a return not settled: waiting, or completed with its refund and stock not all back */
export const orderIdsWithUnsettledReturn = async (db: Db, orderIds: string[]) => {
  if (orderIds.length === 0) return new Set<string>();
  const rows = await db
    .selectDistinct({ orderId: returnsTable.orderId })
    .from(returnsTable)
    .where(
      and(
        inArray(returnsTable.orderId, orderIds),
        or(
          eq(returnsTable.status, "requested"),
          and(eq(returnsTable.status, "completed"), isNull(returnsTable.restoredAt)),
        ),
      ),
    );
  return new Set(rows.map((row) => row.orderId));
};

/** The return window of an order. None yet reads as version 0 (see returnWindowsTable) */
export const findWindow = async (db: Db, orderId: string) => {
  const [row] = await db
    .select()
    .from(returnWindowsTable)
    .where(eq(returnWindowsTable.orderId, orderId))
    .limit(1);
  return row;
};

/** Of these orders, the ones whose points are closed already */
export const orderIdsClosed = async (db: Db, orderIds: string[]) => {
  if (orderIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ orderId: returnWindowsTable.orderId })
    .from(returnWindowsTable)
    .where(
      and(
        inArray(returnWindowsTable.orderId, orderIds),
        isNotNull(returnWindowsTable.pointsClosedAt),
      ),
    );
  return new Set(rows.map((row) => row.orderId));
};

/** Windows closed whose points are not earned yet (the cron finishes them), oldest first */
export const windowsToFinish = (db: Db, limit: number) =>
  db
    .select({ orderId: returnWindowsTable.orderId })
    .from(returnWindowsTable)
    .where(
      and(isNotNull(returnWindowsTable.pointsClosedAt), isNull(returnWindowsTable.pointsEarnedAt)),
    )
    .orderBy(asc(returnWindowsTable.pointsClosedAt))
    .limit(limit);

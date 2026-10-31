import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { toPage, type PageQuery } from "hono-kit/page";
import type { Db } from "#/db/index";
import {
  exchangeLinesTable,
  exchangesTable,
  returnLinesTable,
  returnsTable,
  returnWindowsTable,
} from "#/db/schema";
import type { ExchangeStatus, ReturnStatus } from "./rules";

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
 * Copies of each of the order's lines in its returns and exchanges of these statuses. `excluding` leaves one return
 * or one exchange out. Lines with none are missing
 */
export const copiesIn = async (
  db: Db,
  orderId: string,
  statuses: { returns: ReturnStatus[]; exchanges: ExchangeStatus[] },
  excluding?: { returnId: string } | { exchangeId: string },
) => {
  const fromReturns = await db
    .select({
      orderLineId: returnLinesTable.orderLineId,
      copies: sql<number>`sum(${returnLinesTable.quantity})`,
    })
    .from(returnLinesTable)
    .innerJoin(returnsTable, eq(returnsTable.id, returnLinesTable.returnId))
    .where(
      and(
        eq(returnsTable.orderId, orderId),
        inArray(returnsTable.status, statuses.returns),
        excluding !== undefined && "returnId" in excluding
          ? ne(returnsTable.id, excluding.returnId)
          : undefined,
      ),
    )
    .groupBy(returnLinesTable.orderLineId);
  const fromExchanges = await db
    .select({
      orderLineId: exchangeLinesTable.orderLineId,
      copies: sql<number>`sum(${exchangeLinesTable.quantity})`,
    })
    .from(exchangeLinesTable)
    .innerJoin(exchangesTable, eq(exchangesTable.id, exchangeLinesTable.exchangeId))
    .where(
      and(
        eq(exchangesTable.orderId, orderId),
        inArray(exchangesTable.status, statuses.exchanges),
        excluding !== undefined && "exchangeId" in excluding
          ? ne(exchangesTable.id, excluding.exchangeId)
          : undefined,
      ),
    )
    .groupBy(exchangeLinesTable.orderLineId);
  const copies = new Map<string, number>();
  for (const row of [...fromReturns, ...fromExchanges])
    copies.set(row.orderLineId, (copies.get(row.orderLineId) ?? 0) + row.copies);
  return copies;
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

/**
 * Of these orders, the ones with a return or an exchange not settled: waiting, or its refund and the stock or points
 * not all back (a completed return, a refunded exchange). A received exchange is settled: its money is decided
 */
export const orderIdsWithUnsettled = async (db: Db, orderIds: string[]) => {
  if (orderIds.length === 0) return new Set<string>();
  const [returns, exchanges] = await db.batch([
    db
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
      ),
    db
      .selectDistinct({ orderId: exchangesTable.orderId })
      .from(exchangesTable)
      .where(
        and(
          inArray(exchangesTable.orderId, orderIds),
          or(
            eq(exchangesTable.status, "requested"),
            and(eq(exchangesTable.status, "refunded"), isNull(exchangesTable.restoredAt)),
          ),
        ),
      ),
  ]);
  return new Set([...returns, ...exchanges].map((row) => row.orderId));
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

export const findExchange = async (db: Db, id: string) => {
  const [row] = await db.select().from(exchangesTable).where(eq(exchangesTable.id, id)).limit(1);
  return row;
};

/** An order's exchanges, oldest first */
export const exchangesOf = (db: Db, orderId: string) =>
  db
    .select()
    .from(exchangesTable)
    .where(eq(exchangesTable.orderId, orderId))
    .orderBy(asc(exchangesTable.requestedAt), asc(exchangesTable.id));

export const exchangeLinesOf = (db: Db, exchangeIds: string[]) =>
  exchangeIds.length === 0
    ? Promise.resolve([])
    : db
        .select()
        .from(exchangeLinesTable)
        .where(inArray(exchangeLinesTable.exchangeId, exchangeIds));

/** Newest first. customerId narrows it to one customer's; ?status=requested is what staff still have to decide */
export const listExchanges = async (
  db: Db,
  filter: { customerId?: string; status?: ExchangeStatus },
  query: PageQuery,
) => {
  const { after, limit } = query;
  const rows = await db
    .select()
    .from(exchangesTable)
    .where(
      and(
        filter.customerId === undefined
          ? undefined
          : eq(exchangesTable.customerId, filter.customerId),
        filter.status === undefined ? undefined : eq(exchangesTable.status, filter.status),
        after === undefined
          ? undefined
          : or(
              lt(exchangesTable.requestedAt, after.at),
              and(eq(exchangesTable.requestedAt, after.at), lt(exchangesTable.id, after.id)),
            ),
      ),
    )
    .orderBy(desc(exchangesTable.requestedAt), desc(exchangesTable.id))
    .limit(limit + 1);
  return toPage(rows, limit, (row) => ({ at: row.requestedAt, id: row.id }));
};

/** Refunded exchanges whose points are not back yet (the cron finishes them), oldest first */
export const exchangesToSweep = (db: Db, limit: number) =>
  db
    .select({ id: exchangesTable.id })
    .from(exchangesTable)
    .where(and(eq(exchangesTable.status, "refunded"), isNull(exchangesTable.restoredAt)))
    .orderBy(asc(exchangesTable.receivedAt))
    .limit(limit);

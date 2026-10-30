import { and, asc, desc, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { UserId } from "hono-kit";
import { toPage, type PageQuery } from "hono-kit/page";
import type { Db } from "#/db/index";
import {
  orderLinesTable,
  ordersTable,
  refundsTable,
  returnLinesTable,
  returnsTable,
} from "#/db/schema";
import { placingTimeoutMs, returnStatuses, visibleStatuses } from "./rules";

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

/**
 * What the cron must finish, oldest first, at most `limit` of each: awaiting payment past the deadline,
 * placing for longer than placingTimeoutMs, and cancelled with the giving back not done
 */
export const ordersToSweep = async (db: Db, now: Date, limit: number) => {
  const pick = { id: ordersTable.id, version: ordersTable.version };
  const [expired, stuck, unfinished] = await db.batch([
    db
      .select(pick)
      .from(ordersTable)
      .where(and(eq(ordersTable.status, "awaiting_payment"), lte(ordersTable.paymentDueAt, now)))
      .orderBy(asc(ordersTable.paymentDueAt))
      .limit(limit),
    db
      .select(pick)
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.status, "placing"),
          lte(ordersTable.createdAt, new Date(now.getTime() - placingTimeoutMs)),
        ),
      )
      .orderBy(asc(ordersTable.createdAt))
      .limit(limit),
    db
      .select(pick)
      .from(ordersTable)
      .where(and(eq(ordersTable.status, "cancelled"), isNull(ordersTable.releasedAt)))
      .orderBy(asc(ordersTable.cancelledAt))
      .limit(limit),
  ]);
  return [...expired, ...stuck, ...unfinished];
};

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
  statuses: (typeof returnStatuses)[number][],
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
export const listReturns = async (
  db: Db,
  filter: { status?: (typeof returnStatuses)[number] },
  query: PageQuery,
) => {
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

/** Completed returns whose stock was not put back yet (the cron finishes them), oldest first */
export const returnsToSweep = (db: Db, limit: number) =>
  db
    .select({ id: returnsTable.id })
    .from(returnsTable)
    .where(and(eq(returnsTable.status, "completed"), isNull(returnsTable.stockReturnedAt)))
    .orderBy(asc(returnsTable.completedAt))
    .limit(limit);

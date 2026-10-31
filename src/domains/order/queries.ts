import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import type { UserId } from "hono-kit";
import { toPage, type PageQuery } from "hono-kit/page";
import type { Db } from "#/db/index";
import { orderLinesTable, ordersTable, refundsTable } from "#/db/schema";
import { placingTimeoutMs, visibleStatuses } from "./rules";

/** Any status, placing too: the caller decides what to show */
export const findOrder = async (db: Db, id: string) => {
  const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  return row;
};

/** Who asks: a customer (their own orders), staff (every order) or the cron (placing ones too) */
export type By = { customerId: UserId } | "staff" | "cron";

/**
 * The order as `by` may see it. A placing order is seen only by the cron.
 * Someone else's is undefined, like one that does not exist
 */
export const findOrderFor = async (db: Db, id: string, by: By) => {
  const order = await findOrder(db, id);
  if (order === undefined) return undefined;
  if (order.status === "placing" && by !== "cron") return undefined;
  if (typeof by === "object" && order.customerId !== by.customerId) return undefined;
  return order;
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
      .where(and(eq(ordersTable.status, "awaiting_payment"), lt(ordersTable.paymentDueAt, now)))
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
      .where(and(eq(ordersTable.status, "cancelled"), isNull(ordersTable.restoredAt)))
      .orderBy(asc(ordersTable.cancelledAt))
      .limit(limit),
  ]);
  return [...expired, ...stuck, ...unfinished];
};

/** Orders shipped at or after `since`, oldest first. Whether their return window is open is return's to say */
export const ordersShippedSince = (db: Db, since: Date, limit: number) =>
  db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.status, "shipped"), gte(ordersTable.shippedAt, since)))
    .orderBy(asc(ordersTable.shippedAt), asc(ordersTable.id))
    .limit(limit);

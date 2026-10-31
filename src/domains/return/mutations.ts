import { and, eq, isNull, sql } from "drizzle-orm";
import { updateWithVersion } from "hono-kit/sqlite";
import type { Db } from "#/db/index";
import type { exchangeReasons } from "./rules";

type ExchangeReason = (typeof exchangeReasons)[number];
import {
  exchangeLinesTable,
  exchangesTable,
  returnLinesTable,
  returnsTable,
  returnWindowsTable,
} from "#/db/schema";

/** The window as a request that moved it left it: an insert reads from it, and finds nothing when another request won */
const wonBy = (db: Db, orderId: string, requestId: string) =>
  db
    .select({ one: sql`1` })
    .from(returnWindowsTable)
    .where(
      and(eq(returnWindowsTable.orderId, orderId), eq(returnWindowsTable.lastRequestId, requestId)),
    );

/**
 * The return and its lines, written only where the window's last request is this return. Run in the same batch
 * as the move of the window (lastRequestId set to the return's id): a move that lost leaves the window as another
 * request left it, so these insert nothing. Writing them after the move would leave a moment when the window has
 * moved and the return is not there yet, and a request read in that moment counts the copies without it
 */
export const insertReturnIfWon = (
  db: Db,
  row: { id: string; orderId: string; requestedAt: Date },
  lines: { orderLineId: string; quantity: number }[],
) => [
  db.insert(returnsTable).select(
    db
      .select({
        id: sql<string>`${row.id}`.as("id"),
        orderId: sql<string>`${row.orderId}`.as("order_id"),
        status: sql<"requested">`'requested'`.as("status"),
        rejectReason: sql<null>`null`.as("reject_reason"),
        requestedAt: sql<number>`${row.requestedAt.getTime()}`.as("requested_at"),
        completedAt: sql<null>`null`.as("completed_at"),
        rejectedAt: sql<null>`null`.as("rejected_at"),
        restoredAt: sql<null>`null`.as("restored_at"),
        version: sql<number>`1`.as("version"),
      })
      .from(wonBy(db, row.orderId, row.id).as("won")),
  ),
  ...lines.map((line) =>
    db.insert(returnLinesTable).select(
      db
        .select({
          returnId: sql<string>`${row.id}`.as("return_id"),
          orderLineId: sql<string>`${line.orderLineId}`.as("order_line_id"),
          quantity: sql<number>`${line.quantity}`.as("quantity"),
        })
        .from(wonBy(db, row.orderId, row.id).as("won")),
    ),
  ),
];

/** No row back when the version is no longer the one read */
export const updateReturn = (
  db: Db,
  at: { id: string; version: number },
  values: Partial<Omit<typeof returnsTable.$inferInsert, "id" | "version">>,
) => updateWithVersion(db, returnsTable, at, values);

/** Records that a completed return's stock and points are back. Not a change anyone sees, so the version stays */
export const markReturnRestored = (db: Db, id: string, at: Date) =>
  db
    .update(returnsTable)
    .set({ restoredAt: at })
    .where(and(eq(returnsTable.id, id), isNull(returnsTable.restoredAt)));

type WindowRow = typeof returnWindowsTable.$inferInsert;

/** No row back when the order already has one (made by someone else in between) */
export const insertWindow = (db: Db, row: WindowRow) =>
  db.insert(returnWindowsTable).values(row).onConflictDoNothing().returning();

/** No row back when the version is no longer the one read */
export const updateWindow = (
  db: Db,
  at: { orderId: string; version: number },
  values: Partial<Omit<WindowRow, "orderId" | "version">>,
) => updateWithVersion(db, returnWindowsTable, at, values);

/** Records that a closed window's points are earned. Not a change anyone sees, so the version stays */
export const markPointsEarned = (db: Db, orderId: string, at: Date) =>
  db
    .update(returnWindowsTable)
    .set({ pointsEarnedAt: at })
    .where(and(eq(returnWindowsTable.orderId, orderId), isNull(returnWindowsTable.pointsEarnedAt)));

/** The exchange and its lines, as insertReturnIfWon: only where the window's last request is this exchange */
export const insertExchangeIfWon = (
  db: Db,
  row: {
    id: string;
    orderId: string;
    customerId: string;
    reason: ExchangeReason;
    requestedAt: Date;
  },
  lines: { orderLineId: string; quantity: number }[],
) => [
  db.insert(exchangesTable).select(
    db
      .select({
        id: sql<string>`${row.id}`.as("id"),
        orderId: sql<string>`${row.orderId}`.as("order_id"),
        customerId: sql<string>`${row.customerId}`.as("customer_id"),
        reason: sql<ExchangeReason>`${row.reason}`.as("reason"),
        status: sql<"requested">`'requested'`.as("status"),
        rejectReason: sql<null>`null`.as("reject_reason"),
        requestedAt: sql<number>`${row.requestedAt.getTime()}`.as("requested_at"),
        receivedAt: sql<null>`null`.as("received_at"),
        shippedAt: sql<null>`null`.as("shipped_at"),
        rejectedAt: sql<null>`null`.as("rejected_at"),
        restoredAt: sql<null>`null`.as("restored_at"),
        version: sql<number>`1`.as("version"),
      })
      .from(wonBy(db, row.orderId, row.id).as("won")),
  ),
  ...lines.map((line) =>
    db.insert(exchangeLinesTable).select(
      db
        .select({
          exchangeId: sql<string>`${row.id}`.as("exchange_id"),
          orderLineId: sql<string>`${line.orderLineId}`.as("order_line_id"),
          quantity: sql<number>`${line.quantity}`.as("quantity"),
        })
        .from(wonBy(db, row.orderId, row.id).as("won")),
    ),
  ),
];

/** No row back when the version is no longer the one read */
export const updateExchange = (
  db: Db,
  at: { id: string; version: number },
  values: Partial<Omit<typeof exchangesTable.$inferInsert, "id" | "version">>,
) => updateWithVersion(db, exchangesTable, at, values);

/** Records that a refunded exchange's points are back. Not a change anyone sees, so the version stays */
export const markExchangeRestored = (db: Db, id: string, at: Date) =>
  db
    .update(exchangesTable)
    .set({ restoredAt: at })
    .where(and(eq(exchangesTable.id, id), isNull(exchangesTable.restoredAt)));

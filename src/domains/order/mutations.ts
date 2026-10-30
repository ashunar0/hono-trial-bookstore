import { eq } from "drizzle-orm";
import { updateWithVersion } from "hono-kit/sqlite";
import type { Db } from "#/db/index";
import { orderLinesTable, ordersTable } from "#/db/schema";

type OrderRow = typeof ordersTable.$inferInsert;
type LineRow = typeof orderLinesTable.$inferInsert;

/** The order and its lines. Run in one batch */
export const insertOrder = (db: Db, order: OrderRow, lines: LineRow[]) =>
  [db.insert(ordersTable).values(order), db.insert(orderLinesTable).values(lines)] as const;

/** An order whose placing failed, as if it had never been. Run in one batch */
export const deleteOrder = (db: Db, id: string) =>
  [
    db.delete(orderLinesTable).where(eq(orderLinesTable.orderId, id)),
    db.delete(ordersTable).where(eq(ordersTable.id, id)),
  ] as const;

/** No row back when the version is no longer the one read */
export const updateOrder = (
  db: Db,
  at: { id: string; version: number },
  values: Partial<Omit<OrderRow, "id" | "version">>,
) => updateWithVersion(db, ordersTable, at, values);

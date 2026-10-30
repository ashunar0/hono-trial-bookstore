import type { Db } from "#/db/index";
import type { ordersTable } from "#/db/schema";
import { linesOf, refundsOf } from "#/domains/order/index";
import { orderResponse } from "./_response";

/** An order as GET /orders/:id shows it, with its lines and refunds read */
export const readOrder = async (db: Db, order: typeof ordersTable.$inferSelect) =>
  orderResponse(order, await linesOf(db, order.id), await refundsOf(db, order.id));

import type { Db } from "#/db/index";
import type { ordersTable } from "#/db/schema";
import { linesOf, refundsOf } from "#/domains/order/index";
import { returnLinesOf, returnsOf } from "#/domains/return/index";
import { returnResponse } from "#/routes/returns/_response";
import { orderResponse } from "./_response";

/** An order as GET /orders/:id shows it, with its lines, returns and refunds read */
export const readOrder = async (db: Db, order: typeof ordersTable.$inferSelect) => {
  const returns = await returnsOf(db, order.id);
  const returnLines = await returnLinesOf(
    db,
    returns.map((row) => row.id),
  );
  return orderResponse(
    order,
    await linesOf(db, order.id),
    await refundsOf(db, order.id),
    returns.map((row) => returnResponse(row, returnLines)),
  );
};

import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { insertRefund, updateOrder } from "../mutations";
import { findOrder } from "../queries";
import { canCancel, OrderStatusConflict } from "../rules";
import { giveBack } from "./_giveBack";
import { conflictNow, findFor, type By } from "./_findFor";

type Input = {
  id: string;
  /** A customer cancels their own, staff any. The cron also cancels placing ones, and finishes a cancel that stopped */
  by: By;
  /** The version the caller read: it cancels the order as it saw it */
  version: number;
  now: Date;
};

/**
 * Cancels before shipping. The order switches to cancelled first: once the stock is back someone else can buy it,
 * so a payment coming in at the same time must lose before anything is given back.
 * 1 cancelled (and a refund of the whole total if it was paid, in the same batch) → 2 the stock back →
 * 3 the coupon back → record it is done. 404 → the status and the version.
 * The cron calls it for an order past its payment deadline, one left placing, and one whose giving back stopped
 */
export const cancelOrder = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const order = await findFor(db, input.id, input.by);
  if (order === undefined) return err(NotFound.code);
  // Switched to cancelled, but the giving back stopped halfway: the cron runs it again
  if (input.by === "cron" && order.status === "cancelled" && order.releasedAt === null) {
    await giveBack(deps, order, input.now);
    return ok((await findOrder(db, order.id)) ?? order);
  }
  if (!canCancel(order.status) || order.version !== input.version)
    return err({ code: OrderStatusConflict.code, details: { status: order.status } });

  // 1
  const switched = updateOrder(
    db,
    { id: order.id, version: input.version },
    { status: "cancelled", cancelledAt: input.now, updatedAt: input.now },
  );
  const refund =
    order.status === "paid"
      ? insertRefund(db, {
          id: crypto.randomUUID(),
          orderId: order.id,
          returnId: null,
          amount: order.total,
          tax: order.tax,
          createdAt: input.now,
        })
      : undefined;
  const [rows] =
    refund === undefined ? await db.batch([switched]) : await db.batch([switched, refund]);
  // Inside a batch the rows of updateWithVersion lose their type: only whether it won is read
  if (rows.length === 0) return conflictNow(db, order.id);

  // 2, 3
  await giveBack(deps, order, input.now);

  return ok((await findOrder(db, order.id)) ?? order);
};

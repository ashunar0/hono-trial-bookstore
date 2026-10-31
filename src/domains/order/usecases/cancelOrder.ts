import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { updateOrder } from "../mutations";
import { findOrder, findOrderFor, type By } from "../queries";
import { canCancel, OrderStatusConflict } from "../rules";
import { giveBack } from "./_giveBack";
import { conflictNow } from "./_conflictNow";

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
 * 1 cancelled → 2 the whole total back if it was paid → 3 the stock back → 4 the coupon back → record it is done. 404 → the status and the version.
 * The cron calls it for an order past its payment deadline, one left placing, and one whose giving back stopped
 */
export const cancelOrder = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const order = await findOrderFor(db, input.id, input.by);
  if (order === undefined) return err(NotFound.code);
  // Switched to cancelled, but the giving back stopped halfway: the cron runs it again
  if (input.by === "cron" && order.status === "cancelled" && order.restoredAt === null) {
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
  const [cancelled] = await switched;
  if (cancelled === undefined) return conflictNow(db, order.id);

  // 2, 3, 4
  await giveBack(deps, cancelled, input.now);

  return ok((await findOrder(db, order.id)) ?? order);
};

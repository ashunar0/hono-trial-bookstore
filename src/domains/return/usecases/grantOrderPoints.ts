import { err, NotFound, ok, userId, type DepsVariables } from "hono-kit";
import {
  closeOrderPoints,
  findOrder,
  markOrderPointsEarned,
  refundsOf,
} from "#/domains/order/index";
import { OrderStatusConflict } from "#/domains/order/rules";
import { earnPoints } from "#/domains/point/index";
import { returnsOf } from "../queries";
import { earnBaseOf, returnDeadlineOf } from "../rules";

type Input = { id: string; now: Date };

/** Waiting, or completed with its refund, stock and points not all back yet */
const unsettled = (row: { status: string; restoredAt: Date | null }) =>
  row.status === "requested" || (row.status === "completed" && row.restoredAt === null);

/**
 * The customer earns points on a shipped order once its return period is over. Called by the cron only.
 * 1 the order closes its points (the version moves, a return waiting stops it) → 2 the points are earned under the
 * order's earn id → 3 the order records they are earned. The close comes first: a return asked at the last moment
 * moves the order's version before it writes the return, so of the two requests one gets 409, and points are never
 * earned on an order that is then returned. Earning first, then closing, would let a return in between.
 * 404 → not shipped, or lost to another write 409. Too early, or a return still waiting, is not an error: nothing is
 * done yet (earned: null). Run again, 2 and 3 change nothing, so the cron finishes one that stopped after 1
 */
export const grantOrderPoints = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const found = await findOrder(db, input.id);
  if (found === undefined) return err(NotFound.code);
  if (found.earnId === null) return ok({ earned: null });

  let order = found;
  // 1
  if (order.pointsClosedAt === null) {
    if (order.status !== "shipped" || order.shippedAt === null)
      return err({ code: OrderStatusConflict.code, details: { status: order.status } });
    // The deadline itself still takes a return
    if (input.now <= returnDeadlineOf(order.shippedAt)) return ok({ earned: null });
    // A return being received counts too: completed before its refund is written, it would earn on the books
    const returns = await returnsOf(db, order.id);
    if (returns.some(unsettled)) return ok({ earned: null });

    const closed = await closeOrderPoints(deps, {
      id: order.id,
      version: order.version,
      now: input.now,
    });
    if (!closed.ok) return closed;
    order = closed.value;
  }

  // 2. The returns completed so far are all there will be: a waiting one would have stopped the close, and a
  // return asked after it is turned away by the version
  const refunds = await refundsOf(db, order.id);
  const base = earnBaseOf(
    order,
    refunds.filter((refund) => refund.returnId !== null).map((refund) => refund.amount),
  );
  const earned = await earnPoints(deps, {
    earnId: found.earnId,
    customerId: userId(order.customerId),
    yen: base,
    now: input.now,
  });

  // 3
  await markOrderPointsEarned(deps, { id: order.id, now: input.now });

  return ok({ earned: earned.value.points });
};

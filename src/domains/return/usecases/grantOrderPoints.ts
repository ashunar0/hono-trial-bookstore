import { err, NotFound, ok, userId, type DepsVariables } from "hono-kit";
import { findOrder, refundsOf } from "#/domains/order/index";
import { OrderStatusConflict } from "#/domains/order/rules";
import { earnPoints } from "#/domains/point/index";
import { markPointsEarned } from "../mutations";
import { exchangesOf, findWindow, returnsOf } from "../queries";
import { earnBaseOf, returnDeadlineOf } from "../rules";
import { advanceWindow } from "./_advanceWindow";

type Input = { id: string; now: Date };

/** Waiting, or completed (a return) or refunded (an exchange) with its refund, stock and points not all back yet */
const unsettled = (row: { status: string; restoredAt: Date | null }) =>
  row.status === "requested" ||
  ((row.status === "completed" || row.status === "refunded") && row.restoredAt === null);

/**
 * The customer earns points on a shipped order once its return period is over. Called by the cron only.
 * 1 the order's return window closes its points (the window's version moves, a return waiting stops it) → 2 the
 * points are earned under the order's earn id → 3 the window records they are earned. The close comes first: a
 * return asked at the last moment moves the window's version before it writes the return, so of the two requests one
 * gets 409, and points are never earned on an order that is then returned. Earning first, then closing, would let a
 * return in between.
 * 404 → not shipped, or lost to another write 409. Too early, or a return still waiting, is not an error: nothing is
 * done yet (earned: null). Run again, 2 and 3 change nothing, so the cron finishes one that stopped after 1
 */
export const grantOrderPoints = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const order = await findOrder(db, input.id);
  if (order === undefined) return err(NotFound.code);
  if (order.earnId === null) return ok({ earned: null });

  const window = await findWindow(db, order.id);
  // 1
  if (window?.pointsClosedAt == null) {
    if (order.status !== "shipped" || order.shippedAt === null)
      return err({ code: OrderStatusConflict.code, details: { status: order.status } });
    // The deadline itself still takes a return
    if (input.now <= returnDeadlineOf(order.shippedAt)) return ok({ earned: null });
    // A return being received counts too: completed before its refund is written, it would earn on the books
    const returns = await returnsOf(db, order.id);
    if (returns.some(unsettled)) return ok({ earned: null });
    // An exchange waiting counts, and one refunded before its refund is written; a received one does not: its money is
    // decided, and it is only waiting to be sent
    const exchanges = await exchangesOf(db, order.id);
    if (exchanges.some(unsettled)) return ok({ earned: null });

    const closed = await advanceWindow(deps, {
      orderId: order.id,
      version: window?.version ?? 0,
      values: { pointsClosedAt: input.now },
      now: input.now,
    });
    if (!closed.ok) return closed;
  }

  // 2. The returns completed so far are all there will be: a waiting one would have stopped the close, and a
  // return asked after it is turned away by the version
  const refunds = await refundsOf(db, order.id);
  const base = earnBaseOf(
    order,
    refunds
      .filter((refund) => refund.returnId !== null || refund.exchangeId !== null)
      .map((refund) => refund.amount),
  );
  const earned = await earnPoints(deps, {
    earnId: order.earnId,
    customerId: userId(order.customerId),
    yen: base,
    now: input.now,
  });

  // 3
  await markPointsEarned(db, order.id, input.now);

  return ok({ earned: earned.value.points });
};

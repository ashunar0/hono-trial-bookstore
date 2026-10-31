import type { DepsVariables } from "hono-kit";
import { shippedOrdersEarning } from "#/domains/order/index";
import { orderIdsClosed, orderIdsWithUnsettledReturn, windowsToFinish } from "../queries";
import { returnPeriodMs } from "../rules";

/** How many orders are looked at at once (D1 takes few bound values in one query) */
const ordersAtOnce = 50;

/**
 * The orders whose points the cron must work on, at most `limit` of each kind, oldest first: to close (shipped,
 * the return period over, no return waiting, window not closed yet) and closed with the earning not done. Whether an
 * order is shipped is order's, whether it is closed or a return waits is return's, so order is asked for a few at a
 * time and return keeps the ones with nothing in the way. The deadline itself still takes a return, so it is not
 * over yet.
 * It writes nothing; it is a usecase because it decides from another domain's orders
 */
export const pickOrdersToGrant = async (
  deps: DepsVariables["deps"],
  input: { now: Date; limit: number },
) => {
  const { db } = deps;
  const before = new Date(input.now.getTime() - returnPeriodMs);
  const toClose: { id: string }[] = [];
  let after: { at: Date; id: string } | undefined;
  while (toClose.length < input.limit) {
    const page = await shippedOrdersEarning(db, { before, after, limit: ordersAtOnce });
    const ids = page.map((order) => order.id);
    const closed = await orderIdsClosed(db, ids);
    const waiting = await orderIdsWithUnsettledReturn(db, ids);
    toClose.push(...page.filter((order) => !closed.has(order.id) && !waiting.has(order.id)));
    const last = page.at(-1);
    if (last === undefined || last.shippedAt === null || page.length < ordersAtOnce) break;
    after = { at: last.shippedAt, id: last.id };
  }
  const toFinish = await windowsToFinish(db, input.limit);
  return [
    ...toClose.slice(0, input.limit).map((order) => order.id),
    ...toFinish.map((window) => window.orderId),
  ].map((id) => ({ id }));
};

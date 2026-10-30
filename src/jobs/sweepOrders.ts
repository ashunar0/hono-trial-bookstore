import type { DepsVariables } from "hono-kit";
import { cancelOrder, ordersToSweep } from "#/domains/order/index";

/** How many of each kind one run takes; the rest wait for the next run */
const perRun = 100;

/**
 * Every 15 minutes: cancels orders past their payment deadline and orders left placing, and finishes cancels that
 * stopped halfway. It writes nothing itself: cancelOrder does, and is safe to call again on the same order
 */
export const sweepOrders = async ({ deps, now }: { deps: DepsVariables["deps"]; now: Date }) => {
  for (const order of await ordersToSweep(deps.db, now, perRun)) {
    // One that lost (paid just now, say) is left as it is
    await cancelOrder(deps, { id: order.id, by: "cron", version: order.version, now });
  }
};

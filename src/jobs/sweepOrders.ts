import type { DepsVariables } from "hono-kit";
import { cancelOrder, ordersToSweep, receiveReturn, returnsToSweep } from "#/domains/order/index";

/** How many of each kind one run takes; the rest wait for the next run */
const perRun = 100;

/**
 * Every 15 minutes: cancels orders past their payment deadline and orders left placing, and finishes cancels and
 * received returns that stopped halfway. It writes nothing itself: cancelOrder does, and is safe to call again on the same order.
 * One that throws does not stop the rest (the next run would pick the same one first and stop there again):
 * the run goes on, then fails with every error, so the failure is still seen
 */
export const sweepOrders = async ({ deps, now }: { deps: DepsVariables["deps"]; now: Date }) => {
  const errors: unknown[] = [];
  const each = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      errors.push(error);
    }
  };

  for (const order of await ordersToSweep(deps.db, now, perRun)) {
    // One that lost (paid just now, say) is left as it is
    await each(() => cancelOrder(deps, { id: order.id, by: "cron", version: order.version, now }));
  }
  for (const found of await returnsToSweep(deps.db, perRun)) {
    await each(() => receiveReturn(deps, { returnId: found.id, by: "cron", now }));
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, `${errors.length} orders and returns failed`);
};

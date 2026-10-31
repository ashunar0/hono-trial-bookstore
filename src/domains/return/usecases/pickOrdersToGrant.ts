import type { DepsVariables } from "hono-kit";
import { windowsToClose, windowsToFinish } from "../queries";
import { returnPeriodMs } from "../rules";

/**
 * The orders whose points the cron must work on, at most `limit` of each kind, oldest first: to close (the return
 * period over, nothing waiting, not closed yet) and closed with the earning not done. All of it is return's own: the
 * window copies when the order was shipped. The deadline itself still takes a return, so it is not over yet.
 * It writes nothing
 */
export const pickOrdersToGrant = async (
  deps: DepsVariables["deps"],
  input: { now: Date; limit: number },
) => {
  const { db } = deps;
  const before = new Date(input.now.getTime() - returnPeriodMs);
  const toClose = await windowsToClose(db, before, input.limit);
  const toFinish = await windowsToFinish(db, input.limit);
  return [...toClose, ...toFinish].map((window) => ({ id: window.orderId }));
};

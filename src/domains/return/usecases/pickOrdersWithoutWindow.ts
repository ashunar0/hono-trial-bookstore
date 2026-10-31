import type { DepsVariables } from "hono-kit";
import { ordersShippedSince } from "#/domains/order/index";
import { windowOrderIdsOf } from "../queries";

/** How far back a ship is looked at: the cron runs every 15 minutes, so a day leaves room for it to have been down */
const lookBackMs = 24 * 60 * 60 * 1000;

/**
 * Orders shipped lately whose return window was never opened: a ship that stopped between order's switch and the
 * window. Only the last day is read, so the work does not grow with every order ever shipped.
 * It writes nothing; it is a usecase because it decides from another domain's orders
 */
export const pickOrdersWithoutWindow = async (
  deps: DepsVariables["deps"],
  input: { now: Date; limit: number },
) => {
  const { db } = deps;
  const shipped = await ordersShippedSince(
    db,
    new Date(input.now.getTime() - lookBackMs),
    input.limit,
  );
  const open = await windowOrderIdsOf(
    db,
    shipped.map((order) => order.id),
  );
  return shipped.filter((order) => !open.has(order.id));
};

import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { findOrder, shipOrder } from "#/domains/order/index";
import { OrderStatusConflict } from "#/domains/order/rules";
import { insertWindow } from "../mutations";

/**
 * Staff ship a paid order, and its return window opens: the period of returns and exchanges runs from now. The ship is
 * order's switch; the window is return's, written after it with the shipping time copied (once: a second one does
 * nothing). The cron finishes a ship that stopped between the two (by "cron": the order is shipped already)
 */
export const shipAndOpenWindow = async (
  deps: DepsVariables["deps"],
  input: { id: string; by: "staff" | "cron"; now: Date },
) => {
  const { db } = deps;
  let order;
  if (input.by === "staff") {
    const shipped = await shipOrder(deps, { id: input.id, now: input.now });
    if (!shipped.ok) return shipped;
    order = shipped.value;
  } else {
    order = await findOrder(db, input.id);
    if (order === undefined) return err(NotFound.code);
  }
  if (order.status !== "shipped" || order.shippedAt === null)
    return err({ code: OrderStatusConflict.code, details: { status: order.status } });

  await insertWindow(db, {
    orderId: order.id,
    shippedAt: order.shippedAt,
    earnId: order.earnId,
    version: 1,
    updatedAt: input.now,
  });
  return ok(order);
};

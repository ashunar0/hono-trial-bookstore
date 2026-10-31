import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { updateOrder } from "../mutations";
import { canShip, OrderStatusConflict } from "../rules";
import { findOrderFor } from "../queries";
import { conflictNow } from "./_conflictNow";

/** Staff ship a paid order. From now on it can be returned, not cancelled */
export const shipOrder = async (deps: DepsVariables["deps"], input: { id: string; now: Date }) => {
  const { db } = deps;
  const order = await findOrderFor(db, input.id, "staff");
  if (order === undefined) return err(NotFound.code);
  if (!canShip(order.status))
    return err({ code: OrderStatusConflict.code, details: { status: order.status } });

  const [shipped] = await updateOrder(
    db,
    { id: order.id, version: order.version },
    { status: "shipped", shippedAt: input.now, updatedAt: input.now },
  );
  if (shipped === undefined) return conflictNow(db, order.id);

  return ok(shipped);
};

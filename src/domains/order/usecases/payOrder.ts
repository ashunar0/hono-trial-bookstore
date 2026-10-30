import { err, NotFound, ok, type DepsVariables, type UserId } from "hono-kit";
import { updateOrder } from "../mutations";
import { canPay, OrderStatusConflict, PaymentDeadlinePassed } from "../rules";
import { conflictNow, findFor } from "./_findFor";

type Input = { customerId: UserId; id: string; now: Date };

/**
 * Pays (stands in for a real payment). 404 → the status → past the deadline (even before the cron cancels it).
 * The status comes first: the deadline means something only while it awaits payment, so a paid order is 409 at
 * any time. The deadline itself still pays ("within 3 days"), as a return on its 14th day.
 * Written with the version read here: a cancel that got in first wins, and this is 409
 */
export const payOrder = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const order = await findFor(db, input.id, { customerId: input.customerId });
  if (order === undefined) return err(NotFound.code);
  if (!canPay(order.status))
    return err({ code: OrderStatusConflict.code, details: { status: order.status } });
  if (input.now > order.paymentDueAt) return err(PaymentDeadlinePassed.code);

  const [paid] = await updateOrder(
    db,
    { id: order.id, version: order.version },
    { status: "paid", paidAt: input.now, updatedAt: input.now },
  );
  if (paid === undefined) return conflictNow(db, order.id);

  return ok(paid);
};

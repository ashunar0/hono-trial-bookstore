import { err, NotFound, ok, type DepsVariables, type UserId } from "hono-kit";
import { insertReturn, updateOrder } from "../mutations";
import { linesOf, returnedCopies } from "../queries";
import {
  OrderStatusConflict,
  returnableOf,
  returnDeadlineOf,
  ReturnPeriodEnded,
  ReturnQuantityExceeded,
} from "../rules";
import { findFor } from "./_findFor";

type Input = {
  customerId: UserId;
  orderId: string;
  lines: { orderLineId: string; quantity: number }[];
  now: Date;
};

/**
 * The customer asks to send books of a shipped order back. Nothing is refunded until staff receive them.
 * 404 (the order, or a line not in it) → not shipped 409 → past 14 days 422 → more copies than are left 409.
 * Requested and completed returns count against the copies; rejected ones do not.
 * The order's version moves first, and only the one that moved it writes its return: of two requests at once one
 * loses (409) instead of both counting the same copies, and the loser writes nothing it would have to take back
 */
export const requestReturn = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const order = await findFor(db, input.orderId, { customerId: input.customerId });
  if (order === undefined) return err(NotFound.code);
  const orderLines = new Map((await linesOf(db, order.id)).map((line) => [line.id, line]));
  if (input.lines.some((line) => !orderLines.has(line.orderLineId))) return err(NotFound.code);
  if (order.status !== "shipped" || order.shippedAt === null)
    return err({ code: OrderStatusConflict.code, details: { status: order.status } });
  if (input.now > returnDeadlineOf(order.shippedAt)) return err(ReturnPeriodEnded.code);

  const counted = await returnedCopies(db, order.id, ["requested", "completed"]);
  const left = input.lines.map((line) => ({
    orderLineId: line.orderLineId,
    returnable: returnableOf(
      orderLines.get(line.orderLineId)?.quantity ?? 0,
      counted.get(line.orderLineId) ?? 0,
    ),
  }));
  if (input.lines.some((line, i) => line.quantity > (left[i]?.returnable ?? 0)))
    return err({ code: ReturnQuantityExceeded.code, details: { lines: left } });

  const row = {
    id: crypto.randomUUID(),
    orderId: order.id,
    status: "requested" as const,
    requestedAt: input.now,
    version: 1,
  };
  const [moved] = await updateOrder(
    db,
    { id: order.id, version: order.version },
    { updatedAt: input.now },
  );
  // Another request (or a change) got in after the read
  if (moved === undefined)
    return err({ code: OrderStatusConflict.code, details: { status: order.status } });
  // If this stops here, only the version moved: the customer asks again
  await db.batch(
    insertReturn(
      db,
      row,
      input.lines.map((line) => ({ returnId: row.id, ...line })),
    ),
  );

  return ok({
    ...row,
    rejectReason: null,
    completedAt: null,
    rejectedAt: null,
    restoredAt: null,
  });
};

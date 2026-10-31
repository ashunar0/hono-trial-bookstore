import { err, NotFound, ok, userId, type DepsVariables } from "hono-kit";
import { restock } from "#/domains/inventory/index";
import { restorePoints } from "#/domains/point/index";
import { restoreIdOfReturn } from "#/domains/point/rules";
import { insertRefund, markReturnRestored, updateReturn } from "../mutations";
import { findOrder, findReturn, linesOf, returnedCopies, returnLinesOf } from "../queries";
import { taxWithin } from "#/domains/pricing/rules";
import { pointsRefundOf, refundIdOf, refundOf, ReturnStatusConflict } from "../rules";

type Input = {
  returnId: string;
  /** The cron finishes a return completed whose stock and points are not back yet */
  by: "staff" | "cron";
  now: Date;
};

/**
 * Staff got the books: 1 the return completed → 2 its refund, the points of those books as points and the rest for the
 * card → 3 the stock back under the return's id → 4 the points back under the return's id → record both are back.
 * Only the one that won 1 goes on (a refund in the same batch as 1 would be tried even when 1 lost).
 * 2, 3 and 4 are safe to run again, so the cron finishes a receive that stopped
 */
export const receiveReturn = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const found = await findReturn(db, input.returnId);
  if (found === undefined) return err(NotFound.code);
  const lines = await returnLinesOf(db, [found.id]);
  const orderLines = new Map((await linesOf(db, found.orderId)).map((line) => [line.id, line]));

  if (!(input.by === "cron" && found.status === "completed" && found.restoredAt === null)) {
    if (found.status !== "requested")
      return err({ code: ReturnStatusConflict.code, details: { status: found.status } });

    // 1
    const [completed] = await updateReturn(
      db,
      { id: found.id, version: found.version },
      { status: "completed", completedAt: input.now },
    );
    if (completed === undefined) {
      const current = await findReturn(db, found.id);
      return err({
        code: ReturnStatusConflict.code,
        details: { status: current?.status ?? found.status },
      });
    }
  }

  // 2. Copies of each line refunded before this return: the same on a second run, which counts this one out
  const before = await returnedCopies(db, found.orderId, ["completed"], found.id);
  let amount = 0;
  let points = 0;
  for (const line of lines) {
    const orderLine = orderLines.get(line.orderLineId);
    if (orderLine === undefined) continue;
    const copies = before.get(line.orderLineId) ?? 0;
    amount += refundOf(orderLine, copies, line.quantity);
    points += pointsRefundOf(orderLine, copies, line.quantity);
  }
  await insertRefund(db, {
    id: refundIdOf({ returnId: found.id }),
    orderId: found.orderId,
    returnId: found.id,
    amount,
    pointsAmount: points,
    // Once on the whole refund, as for an order
    tax: taxWithin(amount),
    createdAt: input.now,
  });

  // 3
  await restock(deps, {
    restockId: found.id,
    lines: lines.flatMap((line) => {
      const orderLine = orderLines.get(line.orderLineId);
      return orderLine === undefined ? [] : [{ bookId: orderLine.bookId, quantity: line.quantity }];
    }),
    now: input.now,
  });

  // 4
  const order = await findOrder(db, found.orderId);
  if (order !== undefined)
    await restorePoints(deps, {
      restoreId: restoreIdOfReturn(found.id),
      customerId: userId(order.customerId),
      points,
      now: input.now,
    });
  await markReturnRestored(db, found.id, input.now);

  return ok((await findReturn(db, found.id)) ?? found);
};

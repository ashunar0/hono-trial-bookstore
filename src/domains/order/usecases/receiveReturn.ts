import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { restock } from "#/domains/inventory/index";
import { insertRefund, markStockReturned, updateReturn } from "../mutations";
import { findReturn, linesOf, returnedCopies, returnLinesOf } from "../queries";
import { taxWithin } from "#/domains/pricing/rules";
import { refundOf, ReturnStatusConflict } from "../rules";

type Input = {
  returnId: string;
  /** The cron finishes a return completed whose stock is not back yet */
  by: "staff" | "cron";
  now: Date;
};

/**
 * Staff got the books: 1 the return completed and its refund (one batch, the same domain) → 2 the stock back
 * under the return's id → record it is back. 2 is safe to run again, so the cron finishes a receive that stopped
 */
export const receiveReturn = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const found = await findReturn(db, input.returnId);
  if (found === undefined) return err(NotFound.code);
  const lines = await returnLinesOf(db, [found.id]);
  const orderLines = new Map((await linesOf(db, found.orderId)).map((line) => [line.id, line]));

  if (!(input.by === "cron" && found.status === "completed" && found.stockReturnedAt === null)) {
    if (found.status !== "requested")
      return err({ code: ReturnStatusConflict.code, details: { status: found.status } });

    // 1. Copies of each line refunded before this return
    const before = await returnedCopies(db, found.orderId, ["completed"], found.id);
    const amount = lines.reduce((sum, line) => {
      const orderLine = orderLines.get(line.orderLineId);
      return orderLine === undefined
        ? sum
        : sum + refundOf(orderLine, before.get(line.orderLineId) ?? 0, line.quantity);
    }, 0);
    const [completed] = await db.batch([
      updateReturn(
        db,
        { id: found.id, version: found.version },
        { status: "completed", completedAt: input.now },
      ),
      insertRefund(db, {
        id: crypto.randomUUID(),
        orderId: found.orderId,
        returnId: found.id,
        amount,
        // Once on the whole refund, as for an order
        tax: taxWithin(amount),
        createdAt: input.now,
      }),
    ]);
    if (completed.length === 0) {
      const current = await findReturn(db, found.id);
      return err({
        code: ReturnStatusConflict.code,
        details: { status: current?.status ?? found.status },
      });
    }
  }

  // 2
  await restock(deps, {
    restockId: found.id,
    lines: lines.flatMap((line) => {
      const orderLine = orderLines.get(line.orderLineId);
      return orderLine === undefined ? [] : [{ bookId: orderLine.bookId, quantity: line.quantity }];
    }),
    now: input.now,
  });
  await markStockReturned(db, found.id, input.now);

  return ok((await findReturn(db, found.id)) ?? found);
};

import { ok, type DepsVariables, type UserId } from "hono-kit";
import { insertReturnIfWon, updateWindow } from "../mutations";
import { windowMovedNow } from "./_advanceWindow";
import { checkRequest } from "./_checkRequest";

type Input = {
  customerId: UserId;
  orderId: string;
  lines: { orderLineId: string; quantity: number }[];
  now: Date;
};

/**
 * The customer asks to send books of a shipped order back. Nothing is refunded until staff receive them.
 * The checks are _checkRequest's (returns and exchanges count against the same copies; rejected returns and
 * exchanges do not).
 * The order's return window moves from the version read before the copies were counted, and the return is written in
 * the same batch only where the move was this request's: of two requests at once one loses (409) and writes nothing.
 * There is no moment when the window has moved and the return is not written yet, for another request to count in
 */
export const requestReturn = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const checked = await checkRequest(deps, input);
  if (!checked.ok) return checked;
  const { order, windowVersion } = checked.value;

  const row = {
    id: crypto.randomUUID(),
    orderId: order.id,
    status: "requested" as const,
    requestedAt: input.now,
    version: 1,
  };
  const [moved] = await db.batch([
    updateWindow(
      db,
      { orderId: order.id, version: windowVersion },
      { lastRequestId: row.id, updatedAt: input.now },
    ),
    ...insertReturnIfWon(db, row, input.lines),
  ]);
  // Another request (or the close) got in after the read: nothing of this one was written
  if (moved.length === 0) return windowMovedNow(db, order.id);

  return ok({
    ...row,
    rejectReason: null,
    completedAt: null,
    rejectedAt: null,
    restoredAt: null,
  });
};

import { ok, type DepsVariables, type UserId } from "hono-kit";
import { insertExchangeIfWon, updateWindow } from "../mutations";
import type { exchangeReasons } from "../rules";
import { windowMovedNow } from "./_advanceWindow";
import { checkRequest } from "./_checkRequest";

type Input = {
  customerId: UserId;
  orderId: string;
  reason: (typeof exchangeReasons)[number];
  lines: { orderLineId: string; quantity: number }[];
  now: Date;
};

/**
 * The customer asks to swap damaged copies of a shipped order for others of the same books. Money does not move.
 * The checks and the order of them are a return's (_checkRequest), and so is the move of the return window before
 * the write: of two requests at once, a return or an exchange, one loses (409) and writes nothing
 */
export const requestExchange = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const checked = await checkRequest(deps, input);
  if (!checked.ok) return checked;
  const { order, windowVersion } = checked.value;

  const row = {
    id: crypto.randomUUID(),
    orderId: order.id,
    customerId: order.customerId,
    reason: input.reason,
    status: "requested" as const,
    requestedAt: input.now,
    version: 1,
  };
  // As a return: the move and the rows in one batch, the rows only where the move was this request's
  const [moved] = await db.batch([
    updateWindow(
      db,
      { orderId: order.id, version: windowVersion },
      { lastRequestId: row.id, updatedAt: input.now },
    ),
    ...insertExchangeIfWon(db, row, input.lines),
  ]);
  if (moved.length === 0) return windowMovedNow(db, order.id);

  return ok({
    ...row,
    rejectReason: null,
    receivedAt: null,
    shippedAt: null,
    rejectedAt: null,
    restoredAt: null,
  });
};

import { ok, type DepsVariables, type UserId } from "hono-kit";
import { insertExchange } from "../mutations";
import type { exchangeReasons } from "../rules";
import { advanceWindow } from "./_advanceWindow";
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
  const moved = await advanceWindow(deps, {
    orderId: order.id,
    version: windowVersion,
    now: input.now,
  });
  if (!moved.ok) return moved;
  // If this stops here, only the window moved: the customer asks again
  await db.batch(
    insertExchange(
      db,
      row,
      input.lines.map((line) => ({ exchangeId: row.id, ...line })),
    ),
  );

  return ok({
    ...row,
    rejectReason: null,
    receivedAt: null,
    shippedAt: null,
    rejectedAt: null,
    restoredAt: null,
  });
};

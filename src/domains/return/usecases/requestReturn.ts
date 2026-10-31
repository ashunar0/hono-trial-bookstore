import { ok, type DepsVariables, type UserId } from "hono-kit";
import { insertReturn } from "../mutations";
import { advanceWindow } from "./_advanceWindow";
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
 * The order's return window moves first, and only the one that moved it writes its return: of two requests at once one
 * loses (409) instead of both counting the same copies, and the loser writes nothing it would have to take back
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
  const moved = await advanceWindow(deps, {
    orderId: order.id,
    version: windowVersion,
    now: input.now,
  });
  // Another request (or a change) got in after the read
  if (!moved.ok) return moved;
  // If this stops here, only the window moved: the customer asks again
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

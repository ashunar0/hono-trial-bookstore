import { err, ok, type DepsVariables } from "hono-kit";
import { findOrder } from "#/domains/order/index";
import { OrderStatusConflict } from "#/domains/order/rules";
import { insertWindow, updateWindow } from "../mutations";

type Input = {
  orderId: string;
  /** The version of the window the caller read: 0 when the order has none yet */
  version: number;
  /** Written with the move, for the close of the points; nothing for a request */
  values?: { pointsClosedAt?: Date };
  now: Date;
};

/**
 * Moves the order's return window on from the version read. Of two that read the same version one wins; the other
 * gets ORDER_STATUS_CONFLICT and must write nothing. A request moves the window before it writes its return or
 * exchange, and the close of the points moves it too, so a request asked at the last moment and the close cannot both
 * stand. The first move of an order makes the window (version 1)
 */
export const advanceWindow = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const values = { ...input.values, updatedAt: input.now };
  const [row] =
    input.version === 0
      ? await insertWindow(db, { orderId: input.orderId, ...values, version: 1 })
      : await updateWindow(db, { orderId: input.orderId, version: input.version }, values);
  if (row !== undefined) return ok(row);

  const current = await findOrder(db, input.orderId);
  return err({
    code: OrderStatusConflict.code,
    details: { status: current?.status ?? "cancelled" },
  });
};

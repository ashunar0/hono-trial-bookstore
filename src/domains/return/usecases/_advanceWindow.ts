import { err, ok, type DepsVariables } from "hono-kit";
import { findOrder } from "#/domains/order/index";
import { OrderStatusConflict } from "#/domains/order/rules";
import { insertWindow, updateWindow } from "../mutations";

type Input = {
  orderId: string;
  /** The version of the window the caller read: 0 when the order has none yet */
  version: number;
  /** Written with the move, for the close of the points */
  values?: { pointsClosedAt?: Date };
  now: Date;
};

/**
 * Moves the order's return window on from the version read. Of two that read the same version one wins; the other
 * gets ORDER_STATUS_CONFLICT and must write nothing. The close of the points moves it, and so does a request (in its
 * own batch, with its rows), so a request asked at the last moment and the close cannot both stand. A window the ship
 * did not open is opened here (version 1)
 */
/** A window the ship did not open (it stopped before): opened now with the order's copies, as the ship would have */
export const openWindowLate = async (
  db: DepsVariables["deps"]["db"],
  orderId: string,
  values: { pointsClosedAt?: Date; updatedAt: Date },
) => {
  const order = await findOrder(db, orderId);
  if (order?.shippedAt == null) return [];
  return insertWindow(db, {
    orderId,
    shippedAt: order.shippedAt,
    earnId: order.earnId,
    ...values,
    version: 1,
  });
};

export const advanceWindow = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const values = { ...input.values, updatedAt: input.now };
  const [row] =
    input.version === 0
      ? await openWindowLate(db, input.orderId, values)
      : await updateWindow(db, { orderId: input.orderId, version: input.version }, values);
  if (row !== undefined) return ok(row);
  return windowMovedNow(db, input.orderId);
};

/** What a move that lost answers: ORDER_STATUS_CONFLICT with the order's status now */
export const windowMovedNow = async (db: DepsVariables["deps"]["db"], orderId: string) => {
  const current = await findOrder(db, orderId);
  return err({
    code: OrderStatusConflict.code,
    details: { status: current?.status ?? "cancelled" },
  });
};

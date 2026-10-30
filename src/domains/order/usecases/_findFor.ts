import { err, type UserId } from "hono-kit";
import type { Db } from "#/db/index";
import { findOrder } from "../queries";
import { OrderStatusConflict } from "../rules";

/** Who asks: a customer (their own orders), staff (every order) or the cron (placing ones too) */
export type By = { customerId: UserId } | "staff" | "cron";

/**
 * The order as `by` may see it. A placing order is seen only by the cron.
 * Someone else's is undefined, like one that does not exist
 */
export const findFor = async (db: Db, id: string, by: By) => {
  const order = await findOrder(db, id);
  if (order === undefined) return undefined;
  if (order.status === "placing" && by !== "cron") return undefined;
  if (typeof by === "object" && order.customerId !== by.customerId) return undefined;
  return order;
};

/** A write lost to another after the read (the version moved): ORDER_STATUS_CONFLICT with what it is now */
export const conflictNow = async (db: Db, id: string) => {
  const current = await findOrder(db, id);
  return err({
    code: OrderStatusConflict.code,
    details: { status: current?.status ?? "cancelled" },
  });
};

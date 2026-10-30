import { err, type UserId } from "hono-kit";
import type { Db } from "#/db/index";
import { findOrder } from "../queries";
import { OrderStatusConflict } from "../rules";

/**
 * The order as `customerId` may see it: their own, and not placing. null is staff, who see every order.
 * Someone else's is undefined, like one that does not exist
 */
export const findFor = async (db: Db, id: string, customerId: UserId | null) => {
  const order = await findOrder(db, id);
  if (order === undefined || order.status === "placing") return undefined;
  if (customerId !== null && order.customerId !== customerId) return undefined;
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

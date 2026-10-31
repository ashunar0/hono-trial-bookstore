import { err } from "hono-kit";
import type { Db } from "#/db/index";
import { findOrder } from "../queries";
import { OrderStatusConflict } from "../rules";

/** A write lost to another after the read (the version moved): ORDER_STATUS_CONFLICT with what it is now */
export const conflictNow = async (db: Db, id: string) => {
  const current = await findOrder(db, id);
  return err({
    code: OrderStatusConflict.code,
    details: { status: current?.status ?? "cancelled" },
  });
};

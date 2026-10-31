import { err, NotFound, ok, type DepsVariables, type UserId } from "hono-kit";
import { findOrderFor, linesOf } from "#/domains/order/index";
import { OrderStatusConflict } from "#/domains/order/rules";
import { copiesIn, findWindow } from "../queries";
import {
  returnableOf,
  returnDeadlineOf,
  ReturnPeriodEnded,
  ReturnQuantityExceeded,
} from "../rules";

type Input = {
  customerId: UserId;
  orderId: string;
  lines: { orderLineId: string; quantity: number }[];
  now: Date;
};

/**
 * What a return and an exchange are both asked against, in this order: 404 (the order, or a line not in it) → not
 * shipped 409 → past 14 days 422 → more copies than are left 409. The copies left count both: the ones in returns
 * requested or completed and in exchanges requested, received or refunded. Gives the order and the version of its
 * return window as read before the copies were counted: moving the window from that version fails if anything was
 * asked after
 */
export const checkRequest = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const order = await findOrderFor(db, input.orderId, { customerId: input.customerId });
  if (order === undefined) return err(NotFound.code);
  const orderLines = new Map((await linesOf(db, order.id)).map((line) => [line.id, line]));
  if (input.lines.some((line) => !orderLines.has(line.orderLineId))) return err(NotFound.code);
  if (order.status !== "shipped" || order.shippedAt === null)
    return err({ code: OrderStatusConflict.code, details: { status: order.status } });
  if (input.now > returnDeadlineOf(order.shippedAt)) return err(ReturnPeriodEnded.code);

  const window = await findWindow(db, order.id);
  const counted = await copiesIn(db, order.id, {
    returns: ["requested", "completed"],
    exchanges: ["requested", "received", "refunded"],
  });
  const left = input.lines.map((line) => ({
    orderLineId: line.orderLineId,
    returnable: returnableOf(
      orderLines.get(line.orderLineId)?.quantity ?? 0,
      counted.get(line.orderLineId) ?? 0,
    ),
  }));
  if (input.lines.some((line, i) => line.quantity > (left[i]?.returnable ?? 0)))
    return err({ code: ReturnQuantityExceeded.code, details: { lines: left } });

  return ok({ order, windowVersion: window?.version ?? 0 });
};

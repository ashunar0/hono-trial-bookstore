import { err, NotFound, ok, userId, type DepsVariables } from "hono-kit";
import { releaseReservation, reserveStock } from "#/domains/inventory/index";
import { findOrder, linesOf, recordRefund } from "#/domains/order/index";
import { restorePoints } from "#/domains/point/index";
import { restoreIdOfExchange } from "#/domains/point/rules";
import { markExchangeRestored, updateExchange } from "../mutations";
import { copiesIn, exchangeLinesOf, findExchange } from "../queries";
import {
  ExchangeStatusConflict,
  pointsRefundOf,
  refundOf,
  reservationIdOfExchange,
} from "../rules";
import { exchangeConflictNow } from "./_exchangeConflict";

type Input = {
  exchangeId: string;
  /** The cron finishes an exchange refunded whose points are not back yet */
  by: "staff" | "cron";
  now: Date;
};

/**
 * Staff got the damaged copies. If a copy of each book is on the shelf, it is held for the swap and the exchange
 * becomes received; if not, the money goes back and it becomes refunded. The damaged copies never go back on the shelf.
 * With stock, it takes, so the switch is last (as placing an order): 1 hold the copies under the exchange's id →
 * 2 received (version). Losing at 2 gives the hold back.
 * Without, it lets go of money, so the switch is first (as cancelling): 1 refunded (version) → give back any hold left
 * under the exchange's id (a receive that stopped after holding) → 2 the refund, the points of those books as points
 * and the rest for the card → 3 the points back under the exchange's id → record they are back. Only the one that won
 * 1 goes on. 2 and 3 are safe to run again, so the cron finishes a receive that stopped.
 * 404 → not asked for (not requested) 409
 */
export const receiveExchange = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const found = await findExchange(db, input.exchangeId);
  if (found === undefined) return err(NotFound.code);
  const finishing = input.by === "cron" && found.status === "refunded" && found.restoredAt === null;
  if (!finishing && found.status !== "requested")
    return err({ code: ExchangeStatusConflict.code, details: { status: found.status } });

  const lines = await exchangeLinesOf(db, [found.id]);
  const orderLines = new Map((await linesOf(db, found.orderId)).map((line) => [line.id, line]));

  if (!finishing) {
    const held = await reserveStock(deps, {
      reservationId: reservationIdOfExchange(found.id),
      lines: lines.flatMap((line) => {
        const orderLine = orderLines.get(line.orderLineId);
        return orderLine === undefined
          ? []
          : [{ bookId: orderLine.bookId, quantity: line.quantity }];
      }),
      now: input.now,
    });
    if (held.ok) {
      const [received] = await updateExchange(
        db,
        { id: found.id, version: found.version },
        { status: "received", receivedAt: input.now },
      );
      if (received === undefined) {
        // Lost: whoever won decides what the hold is for, but a hold of ours that the winner does not use goes back
        const lost = await exchangeConflictNow(db, found);
        if (lost.error.details.status !== "received")
          await releaseReservation(deps, {
            reservationId: reservationIdOfExchange(found.id),
            now: input.now,
          });
        return lost;
      }
      return ok(received);
    }

    // No copy left to send (the stock was short, or another order took it in between)
    const [refunded] = await updateExchange(
      db,
      { id: found.id, version: found.version },
      { status: "refunded", receivedAt: input.now },
    );
    if (refunded === undefined) return exchangeConflictNow(db, found);
  }

  // A hold that a receive made and stopped before its switch; nothing when there is none
  await releaseReservation(deps, {
    reservationId: reservationIdOfExchange(found.id),
    now: input.now,
  });

  // 2. Copies of each line refunded before this exchange: the same on a second run, which counts this one out
  const before = await copiesIn(
    db,
    found.orderId,
    { returns: ["completed"], exchanges: ["refunded"] },
    { exchangeId: found.id },
  );
  let amount = 0;
  let points = 0;
  for (const line of lines) {
    const orderLine = orderLines.get(line.orderLineId);
    if (orderLine === undefined) continue;
    const copies = before.get(line.orderLineId) ?? 0;
    amount += refundOf(orderLine, copies, line.quantity);
    points += pointsRefundOf(orderLine, copies, line.quantity);
  }
  await recordRefund(deps, {
    orderId: found.orderId,
    of: { exchangeId: found.id },
    amount,
    points,
    now: input.now,
  });

  // 3
  const order = await findOrder(db, found.orderId);
  if (order !== undefined)
    await restorePoints(deps, {
      restoreId: restoreIdOfExchange(found.id),
      customerId: userId(order.customerId),
      points,
      now: input.now,
    });
  await markExchangeRestored(db, found.id, input.now);

  return ok((await findExchange(db, found.id)) ?? found);
};

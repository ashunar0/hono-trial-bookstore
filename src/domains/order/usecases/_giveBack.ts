import { userId, type DepsVariables } from "hono-kit";
import { releaseCouponUse } from "#/domains/coupon/index";
import { releaseReservation } from "#/domains/inventory/index";
import { restorePointsOfUse } from "#/domains/point/index";
import { insertRefund, markRestored } from "../mutations";
import { refundIdOf } from "../rules";

type Cancelled = {
  id: string;
  customerId: string;
  reservationId: string;
  couponUseId: string | null;
  pointUseId: string | null;
  paidAt: Date | null;
  total: number;
  tax: number;
  pointsUsed: number;
};

/**
 * After the switch to cancelled: the whole total back if it was paid, the stock back, the coupon back, the points back
 * (all the points the use took, read from the use itself, so an order that stopped before using them gets none), then the order
 * records it is done. Only the one that won the switch gets here (a refund in the same batch as the switch would be
 * written even when the switch lost). Every step is safe to run again, so a cancel that stopped halfway is finished
 * by running this again
 */
export const giveBack = async (deps: DepsVariables["deps"], order: Cancelled, now: Date) => {
  if (order.paidAt !== null)
    await insertRefund(deps.db, {
      id: refundIdOf({ orderId: order.id }),
      orderId: order.id,
      returnId: null,
      exchangeId: null,
      amount: order.total,
      // The points go back as points, the rest to the card
      pointsAmount: order.pointsUsed,
      tax: order.tax,
      createdAt: now,
    });
  await releaseReservation(deps, { reservationId: order.reservationId, now });
  if (order.couponUseId !== null) await releaseCouponUse(deps, { useId: order.couponUseId, now });
  if (order.pointUseId !== null)
    await restorePointsOfUse(deps, {
      useId: order.pointUseId,
      customerId: userId(order.customerId),
      now,
    });
  await markRestored(deps.db, order.id, now);
};

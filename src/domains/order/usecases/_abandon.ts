import type { DepsVariables, UserId } from "hono-kit";
import { releaseCouponUse } from "#/domains/coupon/index";
import { releaseReservation } from "#/domains/inventory/index";
import { restorePointsOfUse } from "#/domains/point/index";
import { deleteOrder } from "../mutations";

type Placing = {
  id: string;
  customerId: UserId;
  reservationId: string;
  couponUseId: string | null;
  pointUseId: string | null;
};

/**
 * A placing that failed at one of its steps: everything any step may have taken goes back, latest first, then the
 * order is deleted. Each give-back does nothing for a step that was not reached, so this does not need to know which
 * step failed: a new step adds its give-back here. Returns the failure as it came
 */
export const abandon = async <F>(
  deps: DepsVariables["deps"],
  order: Placing,
  failure: F,
  now: Date,
) => {
  if (order.pointUseId !== null)
    await restorePointsOfUse(deps, { useId: order.pointUseId, customerId: order.customerId, now });
  if (order.couponUseId !== null) await releaseCouponUse(deps, { useId: order.couponUseId, now });
  await releaseReservation(deps, { reservationId: order.reservationId, now });
  await deps.db.batch(deleteOrder(deps.db, order.id));
  return failure;
};

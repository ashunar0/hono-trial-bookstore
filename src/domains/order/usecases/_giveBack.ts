import type { DepsVariables } from "hono-kit";
import { releaseCouponUse } from "#/domains/coupon/index";
import { releaseReservation } from "#/domains/inventory/index";
import { markReleased } from "../mutations";

type Cancelled = { id: string; reservationId: string; couponUseId: string | null };

/**
 * After the switch to cancelled: the stock back, the coupon back, then the order records it is done.
 * Every step is safe to run again, so a cancel that stopped halfway is finished by running this again
 */
export const giveBack = async (deps: DepsVariables["deps"], order: Cancelled, now: Date) => {
  await releaseReservation(deps, { reservationId: order.reservationId, now });
  if (order.couponUseId !== null) await releaseCouponUse(deps, { useId: order.couponUseId, now });
  await markReleased(deps.db, order.id, now);
};

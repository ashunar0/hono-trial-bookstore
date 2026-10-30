import { ok, type DepsVariables } from "hono-kit";
import { markUseReleased } from "../mutations";

/** The customer can use the coupon again. Safe to run again, and on a use never made */
export const releaseCouponUse = async (
  deps: DepsVariables["deps"],
  input: { useId: string; now: Date },
) => {
  await markUseReleased(deps.db, input.useId, input.now);

  return ok({ useId: input.useId });
};

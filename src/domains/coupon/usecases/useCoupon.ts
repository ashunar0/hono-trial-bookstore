import { err, ok, type DepsVariables, type UserId } from "hono-kit";
import { uniqueViolationOf } from "hono-kit/sqlite";
import { insertCouponUse } from "../mutations";
import { CouponAlreadyUsed } from "../rules";

type Input = {
  /** Made by the caller and kept by it, so it can give the use back */
  useId: string;
  couponId: string;
  customerId: UserId;
  now: Date;
};

/** Marks the coupon used by the customer. Run again with the same id, nothing more is used */
export const useCoupon = async (deps: DepsVariables["deps"], input: Input) => {
  try {
    await insertCouponUse(deps.db, {
      id: input.useId,
      couponId: input.couponId,
      customerId: input.customerId,
      status: "used",
      usedAt: input.now,
    });
  } catch (error) {
    const column = uniqueViolationOf(error);
    if (column === "coupon_uses.id") return ok({ useId: input.useId });
    if (column !== null) return err(CouponAlreadyUsed.code);
    throw error;
  }

  return ok({ useId: input.useId });
};

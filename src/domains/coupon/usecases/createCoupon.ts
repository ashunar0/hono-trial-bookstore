import { err, ok, type DepsVariables } from "hono-kit";
import { uniqueViolationOf } from "hono-kit/sqlite";
import { insertCoupon } from "../mutations";
import { CouponCodeTaken, normalizeCode, type CouponInput } from "../rules";

type Input = { coupon: CouponInput; now: Date };

export const createCoupon = async (deps: DepsVariables["deps"], input: Input) => {
  const { coupon } = input;
  const row = {
    id: crypto.randomUUID(),
    ...coupon,
    code: normalizeCode(coupon.code),
    startsAt: new Date(coupon.startsAt),
    endsAt: new Date(coupon.endsAt),
    stoppedAt: null,
    createdAt: input.now,
  };
  try {
    await insertCoupon(deps.db, row);
  } catch (error) {
    if (uniqueViolationOf(error) === "coupons.code") return err(CouponCodeTaken.code);
    throw error;
  }

  return ok(row);
};

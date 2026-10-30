import { describe, expect, it } from "vitest";
import type { CouponTerms } from "#/domains/coupon/rules";
import { estimate } from "./rules";

const now = new Date("2026-11-15T00:00:00+09:00");
const november = {
  startsAt: new Date("2026-11-01T00:00:00+09:00"),
  endsAt: new Date("2026-12-01T00:00:00+09:00"),
  stoppedAt: null,
};
const fixed500: CouponTerms = { kind: "fixed", value: 500, minSubtotal: 3000, ...november };
const percent15: CouponTerms = { kind: "percent", value: 15, minSubtotal: 0, ...november };

describe("the design's examples", () => {
  it("fixed: 3,500 − 500 = 3,000, free shipping, tax 272", () => {
    const lines = [
      { unitPrice: 2000, quantity: 1 },
      { unitPrice: 1500, quantity: 1 },
    ];

    expect(estimate(lines, { coupon: fixed500 }, now)).toEqual({
      subtotal: 3500,
      discount: 500,
      shippingFee: 0,
      total: 3000,
      tax: 272,
      notApplicable: null,
    });
  });

  it("percent: 1,980 − 297 (15%, fraction dropped) = 1,683, + 550 shipping = 2,233, tax 203", () => {
    expect(estimate([{ unitPrice: 1980, quantity: 1 }], { coupon: percent15 }, now)).toEqual({
      subtotal: 1980,
      discount: 297,
      shippingFee: 550,
      total: 2233,
      tax: 203,
      notApplicable: null,
    });
  });
});

it("shipping is decided after the coupon: 3,000 before it is not enough", () => {
  const lines = [{ unitPrice: 3000, quantity: 1 }];

  expect(estimate(lines, null, now)).toMatchObject({ shippingFee: 0, total: 3000 });
  expect(estimate(lines, { coupon: percent15 }, now)).toMatchObject({
    discount: 450,
    shippingFee: 550,
    total: 3100,
  });
});

it("an empty cart costs nothing, shipping included", () => {
  expect(estimate([], null, now)).toMatchObject({ subtotal: 0, shippingFee: 0, total: 0, tax: 0 });
});

it("a coupon that does not apply takes nothing off and says why", () => {
  const lines = [{ unitPrice: 2000, quantity: 1 }];
  const reason = (coupon: CouponTerms | undefined, at = now) =>
    estimate(lines, { coupon }, at).notApplicable;

  expect(reason(undefined)).toBe("not_found");
  expect(reason(fixed500)).toBe("below_minimum");
  expect(reason({ ...percent15, stoppedAt: now })).toBe("stopped");
  expect(reason(percent15, new Date("2026-10-31T23:59:59+09:00"))).toBe("not_started");
  expect(reason(percent15, new Date("2026-12-01T00:00:00+09:00"))).toBe("ended");
  expect(estimate(lines, { coupon: fixed500 }, now)).toMatchObject({ discount: 0, total: 2550 });
});

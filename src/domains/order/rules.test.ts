import { expect, it } from "vitest";
import { allocateDiscount, paymentDueOf } from "./rules";

it("splits the discount by the lines' amounts; the last line takes the rest (the design's example)", () => {
  expect(allocateDiscount([2000, 1500], 500)).toEqual([285, 215]);
});

it("the lines always add up to the discount", () => {
  const shares = allocateDiscount([1000, 1000, 1000], 100);

  expect(shares).toEqual([33, 33, 34]);
  expect(allocateDiscount([1980], 297)).toEqual([297]);
  expect(allocateDiscount([500, 700], 0)).toEqual([0, 0]);
});

it("payment is due 3 days after placing", () => {
  expect(paymentDueOf(new Date("2026-11-15T10:00:00Z"))).toEqual(new Date("2026-11-18T10:00:00Z"));
});

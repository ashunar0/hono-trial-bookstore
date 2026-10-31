import { describe, expect, it } from "vitest";
import { allocateDiscount, allocatePoints, amountToPay, paymentDueOf, refundOf } from "./rules";

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

describe("refundOf", () => {
  it("one copy: its price less the line's discount (the design's example: 1,500 − 215)", () => {
    expect(refundOf({ unitPrice: 1500, quantity: 1, discount: 215 }, 0, 1)).toBe(1285);
  });

  it("copies of a line: each drops its fraction, the last copy takes the rest", () => {
    const line = { unitPrice: 1000, quantity: 3, discount: 500 };

    expect(refundOf(line, 0, 1)).toBe(834);
    expect(refundOf(line, 1, 1)).toBe(834);
    expect(refundOf(line, 2, 1)).toBe(832);
    // All three: what was paid for the line
    expect(refundOf(line, 0, 3)).toBe(2500);
  });
});

describe("allocatePoints", () => {
  it("the fee is a share too: 500 points on a 1,000 yen book and a 550 yen fee (the design's example)", () => {
    expect(allocatePoints([1000], 550, 500)).toEqual({ lines: [323], shipping: 177 });
  });

  it("splits by what each line cost after the discount; the last book takes the rest", () => {
    const { lines, shipping } = allocatePoints([1000, 1000, 1000], 0, 100);

    expect(lines).toEqual([33, 33, 34]);
    expect(shipping).toBe(0);
  });

  it("the shares always add up to the points", () => {
    const { lines, shipping } = allocatePoints([1785, 1215], 550, 777);

    expect(lines.reduce((sum, share) => sum + share, 0) + shipping).toBe(777);
  });

  it("no points, nothing shared", () => {
    expect(allocatePoints([1000, 500], 550, 0)).toEqual({ lines: [0, 0], shipping: 0 });
  });

  it("points for the whole total give every line and the fee exactly its amount", () => {
    expect(allocatePoints([1785, 1215], 550, 3550)).toEqual({ lines: [1785, 1215], shipping: 550 });
  });
});

it("the card pays the total less the points", () => {
  expect(amountToPay({ total: 3200, pointsUsed: 500 })).toBe(2700);
});

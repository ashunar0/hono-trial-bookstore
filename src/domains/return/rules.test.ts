import { describe, expect, it } from "vitest";
import { refundOf } from "./rules";

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

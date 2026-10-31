/**
 * Returns: books sent back after shipping. Reads order's rules for the way an amount is shared over copies
 */
import { z } from "zod";
import { shareOf } from "#/domains/order/rules";

export const returnStatuses = ["requested", "completed", "rejected"] as const;

export type ReturnStatus = (typeof returnStatuses)[number];

/** A return is requested within 14 days of shipping */
export const returnPeriodMs = 14 * 24 * 60 * 60 * 1000;

export const returnDeadlineOf = (shippedAt: Date) => new Date(shippedAt.getTime() + returnPeriodMs);

/**
 * The yen the points are earned on: the books after the discount, less the money given back for returned books.
 * The shipping fee is not in it, and what was paid with points is
 */
export const earnBaseOf = (
  order: { subtotal: number; discount: number },
  returnRefunds: number[],
) => order.subtotal - order.discount - returnRefunds.reduce((sum, amount) => sum + amount, 0);

/** How many copies of a line can still be asked back: shipped, less the requested and completed ones */
export const returnableOf = (shipped: number, counted: number) => Math.max(shipped - counted, 0);

/**
 * The money given back for `returning` copies of a line, when `before` copies of it were already refunded.
 * Each copy is its price less its share of the line's discount: the share drops its fraction, and the line's last
 * copy takes what is left, so the whole line given back is exactly what was paid for it
 */
export const refundOf = (
  line: { unitPrice: number; quantity: number; discount: number },
  before: number,
  returning: number,
) => line.unitPrice * returning - shareOf(line.discount, line.quantity, before, returning);

/**
 * The points that go back for `returning` copies of a line: the points shared to it, by the same split as the
 * discount. The card gets the rest of the refund. The points shared to the shipping fee never come back, as the fee
 * does not
 */
export const pointsRefundOf = (
  line: { quantity: number; points: number },
  before: number,
  returning: number,
) => shareOf(line.points, line.quantity, before, returning);

export const ReturnPeriodEnded = {
  code: "RETURN_PERIOD_ENDED",
  kind: "unprocessable",
  message: "Returns are taken within 14 days of shipping",
} as const;

export const ReturnQuantityExceeded = {
  code: "RETURN_QUANTITY_EXCEEDED",
  kind: "conflict",
  message: "More copies than can be returned",
  /** How many copies of each line asked for can still be returned */
  details: z.object({
    lines: z.array(z.object({ orderLineId: z.string(), returnable: z.number() })),
  }),
} as const;

export const ReturnStatusConflict = {
  code: "RETURN_STATUS_CONFLICT",
  kind: "conflict",
  message: "The return is not awaiting a decision (or it changed after it was read)",
  details: z.object({ status: z.enum(returnStatuses) }),
} as const;

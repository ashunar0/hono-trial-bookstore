/**
 * Coupons. Imports nothing but zod. What a coupon must be holds wherever it is made from, so its shape lives here
 */
import { z } from "zod";

export const couponKinds = ["fixed", "percent"] as const;

/** Codes are kept in capitals, so "spring500" finds SPRING500 */
export const normalizeCode = (code: string) => code.trim().toUpperCase();

const common = {
  code: z.string().trim().min(1).max(32),
  /** Yen. The subtotal must reach it. 0 is no condition */
  minSubtotal: z.int().min(0),
  /** Usable from startsAt until endsAt, judged when the order is placed. With an offset (+09:00) */
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
};

/** What staff make. A fixed discount never takes the subtotal below 0: it needs a minSubtotal at least as large */
export const couponSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), value: z.int().min(1), ...common }),
    z.object({ kind: z.literal("percent"), value: z.int().min(1).max(100), ...common }),
  ])
  .refine((c) => c.kind !== "fixed" || c.minSubtotal >= c.value, {
    message: "A fixed discount needs a minSubtotal at least as large as the discount",
    path: ["minSubtotal"],
  })
  .refine((c) => new Date(c.endsAt) > new Date(c.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export type CouponInput = z.infer<typeof couponSchema>;

export const CouponCodeTaken = {
  code: "COUPON_CODE_TAKEN",
  kind: "conflict",
  message: "Another coupon has this code",
} as const;

/** What deciding a discount needs of a coupon */
export type CouponTerms = {
  kind: (typeof couponKinds)[number];
  value: number;
  minSubtotal: number;
  startsAt: Date;
  endsAt: Date;
  stoppedAt: Date | null;
};

export const notApplicableReasons = [
  "not_found",
  "not_started",
  "ended",
  "stopped",
  "below_minimum",
] as const;

export type NotApplicableReason = (typeof notApplicableReasons)[number];

export const CouponNotApplicable = {
  code: "COUPON_NOT_APPLICABLE",
  kind: "unprocessable",
  message: "This coupon cannot be used for this order",
  details: z.object({ reason: z.enum(notApplicableReasons) }),
} as const;

/**
 * How much the coupon takes off the books' subtotal at `now`, or why it does not apply.
 * undefined is a code that matches no coupon. Usable from startsAt until (not including) endsAt.
 * A percent discount drops the fraction of a yen
 */
export const discountOf = (
  coupon: CouponTerms | undefined,
  subtotal: number,
  now: Date,
): { discount: number } | { reason: NotApplicableReason } => {
  if (coupon === undefined) return { reason: "not_found" };
  if (coupon.stoppedAt !== null) return { reason: "stopped" };
  if (now < coupon.startsAt) return { reason: "not_started" };
  if (now >= coupon.endsAt) return { reason: "ended" };
  if (subtotal < coupon.minSubtotal) return { reason: "below_minimum" };
  const discount =
    coupon.kind === "fixed" ? coupon.value : Math.floor((subtotal * coupon.value) / 100);
  return { discount };
};

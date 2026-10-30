import { z } from "zod";
import type { couponsTable } from "#/db/schema";
import { couponKinds } from "#/domains/coupon/rules";

type CouponRow = typeof couponsTable.$inferSelect;

/** A line of GET /coupons, and what a write returns */
export const couponResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  kind: z.enum(couponKinds),
  value: z.number(),
  minSubtotal: z.number(),
  startsAt: z.string(),
  endsAt: z.string(),
  stoppedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const couponResponse = (row: CouponRow): z.infer<typeof couponResponseSchema> => ({
  id: row.id,
  code: row.code,
  kind: row.kind,
  value: row.value,
  minSubtotal: row.minSubtotal,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  stoppedAt: row.stoppedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

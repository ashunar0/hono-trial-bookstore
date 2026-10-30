/**
 * Orders. Imports nothing but zod
 */
import { z } from "zod";

/** placing is inside only: shown to no one, and the cron cancels one left over 10 minutes */
export const orderStatuses = [
  "placing",
  "awaiting_payment",
  "paid",
  "shipped",
  "cancelled",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

/** What a list or a reader may see: every status but placing */
export const visibleStatuses = ["awaiting_payment", "paid", "shipped", "cancelled"] as const;

/** Payment is due 3 days after placing */
export const paymentDueOf = (placedAt: Date) =>
  new Date(placedAt.getTime() + 3 * 24 * 60 * 60 * 1000);

/**
 * Splits the discount over the lines by their amounts. Each line drops its fraction of a yen and the last line
 * takes what is left, so the lines add up to the discount exactly
 */
export const allocateDiscount = (amounts: number[], discount: number) => {
  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0);
  if (subtotal === 0 || discount === 0) return amounts.map(() => 0);
  const shares = amounts.map((amount) => Math.floor((discount * amount) / subtotal));
  const given = shares.slice(0, -1).reduce((sum, share) => sum + share, 0);
  return [...shares.slice(0, -1), discount - given];
};

export const CartEmpty = {
  code: "CART_EMPTY",
  kind: "unprocessable",
  message: "The cart is empty",
} as const;

export const OrderStatusConflict = {
  code: "ORDER_STATUS_CONFLICT",
  kind: "conflict",
  message: "The order is not in a state that allows this (or it changed after it was read)",
  details: z.object({ status: z.enum(orderStatuses) }),
} as const;

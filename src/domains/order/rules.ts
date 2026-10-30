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

/** What each operation needs the order to be in */
export const canPay = (status: OrderStatus) => status === "awaiting_payment";
export const canShip = (status: OrderStatus) => status === "paid";
/** Before shipping. placing too, for the cron: a placing order is never shown, so no one else can ask */
export const canCancel = (status: OrderStatus) =>
  status === "placing" || status === "awaiting_payment" || status === "paid";

export const PaymentDeadlinePassed = {
  code: "PAYMENT_DEADLINE_PASSED",
  kind: "unprocessable",
  message: "The payment deadline has passed (the order is cancelled soon, if it is not yet)",
} as const;

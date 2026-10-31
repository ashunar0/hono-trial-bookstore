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

/**
 * Splits the points paid with over the lines by what each cost after the discount, the shipping fee as one more share
 * (it is not a line of the order, so it comes back as `shipping`). Every share drops its fraction and the last line of
 * books takes what is left, so the shares add up to the points exactly: 500 points on a 1,000 yen book and a 550 yen
 * fee are 323 for the book and 177 for the fee
 */
export const allocatePoints = (amounts: number[], shippingFee: number, points: number) => {
  const whole = amounts.reduce((sum, amount) => sum + amount, 0) + shippingFee;
  if (whole === 0 || points === 0) return { lines: amounts.map(() => 0), shipping: 0 };
  const shares = amounts.map((amount) => Math.floor((points * amount) / whole));
  const shipping = Math.floor((points * shippingFee) / whole);
  const given = shares.slice(0, -1).reduce((sum, share) => sum + share, 0) + shipping;
  return { lines: [...shares.slice(0, -1), points - given], shipping };
};

/** What the card pays: the total less the points. The payment is asked this, never the total */
export const amountToPay = (order: { total: number; pointsUsed: number }) =>
  order.total - order.pointsUsed;

export const CartEmpty = {
  code: "CART_EMPTY",
  kind: "unprocessable",
  message: "The cart is empty",
} as const;

export const PointsExceedTotal = {
  code: "POINTS_EXCEED_TOTAL",
  kind: "unprocessable",
  message: "More points than the total of the order",
  /** The total the points were asked against */
  details: z.object({ total: z.number() }),
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

/** A placing order older than this stopped halfway: the cron cancels it */
export const placingTimeoutMs = 10 * 60 * 1000;

/**
 * What `returning` copies of a line carry of an amount shared over the line (its discount, its points), when `before`
 * copies were already given back. Each copy takes its fraction dropped, and the line's last copy takes what is left
 */
export const shareOf = (total: number, quantity: number, before: number, returning: number) => {
  const share = Math.floor(total / quantity);
  const lastShare = total - share * (quantity - 1);
  let amount = 0;
  for (let copy = before; copy < before + returning; copy++)
    amount += copy === quantity - 1 ? lastShare : share;
  return amount;
};

/** A refund's id, fixed by what it gives back: one per cancelled order, one per return */
export const refundIdOf = (of: { orderId: string } | { returnId: string }) =>
  "orderId" in of ? `refund-order-${of.orderId}` : `refund-return-${of.returnId}`;

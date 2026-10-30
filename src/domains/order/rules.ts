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

/** A placing order older than this stopped halfway: the cron cancels it */
export const placingTimeoutMs = 10 * 60 * 1000;

export const returnStatuses = ["requested", "completed", "rejected"] as const;

/** A return is requested within 14 days of shipping */
export const returnDeadlineOf = (shippedAt: Date) =>
  new Date(shippedAt.getTime() + 14 * 24 * 60 * 60 * 1000);

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
) => {
  const share = Math.floor(line.discount / line.quantity);
  const lastShare = line.discount - share * (line.quantity - 1);
  let amount = 0;
  for (let copy = before; copy < before + returning; copy++)
    amount += line.unitPrice - (copy === line.quantity - 1 ? lastShare : share);
  return amount;
};

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

/**
 * What an order costs: the cart's estimate and placing an order both use it. Rules only, below cart and order.
 * Every price is yen with tax included
 */
import { discountOf, type CouponTerms, type NotApplicableReason } from "#/domains/coupon/rules";

/** Yen. Free from this much (after the coupon) */
export const freeShippingFrom = 3000;
export const shippingFee = 550;

type Line = { unitPrice: number; quantity: number };

/** The tax within a tax-included amount: × 10/110, dropping the fraction. Once per order, and once per refund */
export const taxWithin = (amount: number) => Math.floor((amount * 10) / 110);

/**
 * subtotal → the coupon (off the books only) → shipping, decided after the coupon → total → the tax within it,
 * total × 10/110 dropping the fraction, once per order (books and shipping are both 10%).
 * `asked` is null when no coupon was asked for; its coupon is undefined when the code matched none
 */
export const estimate = (
  lines: Line[],
  asked: { coupon: CouponTerms | undefined } | null,
  now: Date,
) => {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const applied = asked === null ? null : discountOf(asked.coupon, subtotal, now);
  const discount = applied !== null && "discount" in applied ? applied.discount : 0;
  const afterDiscount = subtotal - discount;
  const shipping = lines.length === 0 || afterDiscount >= freeShippingFrom ? 0 : shippingFee;
  const total = afterDiscount + shipping;
  const tax = taxWithin(total);
  const notApplicable: NotApplicableReason | null =
    applied !== null && "reason" in applied ? applied.reason : null;
  return { subtotal, discount, shippingFee: shipping, total, tax, notApplicable };
};

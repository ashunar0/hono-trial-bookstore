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

/**
 * The cart at today's prices, and its estimate. The cart's GET and placing an order both read the same three
 * things and call this, so what the customer sees is what they pay. A book gone from the shop drops its line
 */
export const priceCart = (
  items: { bookId: string; quantity: number }[],
  books: { id: string; title: string; price: number }[],
  asked: { coupon: CouponTerms | undefined } | null,
  now: Date,
) => {
  const byId = new Map(books.map((b) => [b.id, b]));
  const lines = items.flatMap((item) => {
    const book = byId.get(item.bookId);
    return book === undefined
      ? []
      : [{ bookId: book.id, title: book.title, unitPrice: book.price, quantity: item.quantity }];
  });
  return { lines, ...estimate(lines, asked, now) };
};

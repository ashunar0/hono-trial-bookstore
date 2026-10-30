import type { UserId } from "hono-kit";
import type { Db } from "#/db/index";
import { findBooks } from "#/domains/book/index";
import { cartItemsOf } from "#/domains/cart/index";
import { findCouponByCode } from "#/domains/coupon/index";
import { priceCart } from "#/domains/pricing/rules";
import type { CartResponse } from "./_response";

/** The cart with today's prices, and the estimate with the coupon tried (if any) */
export const readCart = async (
  db: Db,
  customerId: UserId,
  couponCode: string | undefined,
  now: Date,
): Promise<CartResponse> => {
  const items = await cartItemsOf(db, customerId);
  const books = await findBooks(
    db,
    items.map((i) => i.bookId),
  );
  const asked =
    couponCode === undefined ? null : { coupon: await findCouponByCode(db, couponCode) };
  const { lines, notApplicable, ...money } = priceCart(items, books, asked, now);

  return {
    items: lines,
    ...money,
    coupon:
      couponCode === undefined
        ? null
        : { code: couponCode, applied: notApplicable === null, reason: notApplicable },
  };
};

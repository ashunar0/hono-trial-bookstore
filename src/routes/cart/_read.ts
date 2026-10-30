import type { UserId } from "hono-kit";
import type { Db } from "#/db/index";
import { findBooks } from "#/domains/book/index";
import { cartItemsOf } from "#/domains/cart/index";
import { findCouponByCode } from "#/domains/coupon/index";
import { estimate } from "#/domains/pricing/rules";
import type { CartResponse } from "./_response";

/** The cart with today's prices, and the estimate with the coupon tried (if any) */
export const readCart = async (
  db: Db,
  customerId: UserId,
  couponCode: string | undefined,
  now: Date,
): Promise<CartResponse> => {
  const items = await cartItemsOf(db, customerId);
  const books = new Map(
    (
      await findBooks(
        db,
        items.map((i) => i.bookId),
      )
    ).map((b) => [b.id, b]),
  );
  const lines = items.flatMap((item) => {
    const book = books.get(item.bookId);
    return book === undefined
      ? []
      : [{ bookId: book.id, title: book.title, unitPrice: book.price, quantity: item.quantity }];
  });
  const asked =
    couponCode === undefined ? null : { coupon: await findCouponByCode(db, couponCode) };
  const { notApplicable, ...money } = estimate(lines, asked, now);

  return {
    items: lines,
    ...money,
    coupon:
      couponCode === undefined
        ? null
        : { code: couponCode, applied: notApplicable === null, reason: notApplicable },
  };
};

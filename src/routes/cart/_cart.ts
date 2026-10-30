import { z } from "zod";
import type { UserId } from "hono-kit";
import type { Db } from "#/db/index";
import { findBooks } from "#/domains/book/index";
import { cartItemsOf } from "#/domains/cart/index";
import { findCouponByCode } from "#/domains/coupon/index";
import { notApplicableReasons } from "#/domains/coupon/rules";
import { estimate } from "#/domains/pricing/rules";

/** GET /cart, and what PUT /cart/items/:bookId returns */
export const cartResponseSchema = z.object({
  items: z.array(
    z.object({
      bookId: z.string(),
      title: z.string(),
      /** Yen, tax included, as the book is priced now */
      unitPrice: z.number(),
      quantity: z.number(),
    }),
  ),
  subtotal: z.number(),
  discount: z.number(),
  shippingFee: z.number(),
  total: z.number(),
  /** The tax within total */
  tax: z.number(),
  /** The coupon tried with ?coupon=. Not applied: discount is 0 and reason says why */
  coupon: z
    .object({
      code: z.string(),
      applied: z.boolean(),
      reason: z.enum(notApplicableReasons).nullable(),
    })
    .nullable(),
});

/** The cart with today's prices, and the estimate with the coupon tried (if any) */
export const readCart = async (
  db: Db,
  customerId: UserId,
  couponCode: string | undefined,
  now: Date,
): Promise<z.infer<typeof cartResponseSchema>> => {
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

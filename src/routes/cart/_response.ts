import { z } from "zod";
import { notApplicableReasons } from "#/domains/coupon/rules";

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

export type CartResponse = z.infer<typeof cartResponseSchema>;

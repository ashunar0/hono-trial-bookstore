import { z } from "zod";
import { authorSchema, priceSchema, titleSchema } from "#/domains/book/index";

/** POST /books and PUT /books/:id. The domain's rules, and a cap on how long a string may be */
export const bookInputSchema = z.object({
  title: titleSchema.max(200),
  author: authorSchema.max(200),
  price: priceSchema,
});

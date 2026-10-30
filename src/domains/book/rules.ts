/**
 * Books. What holds wherever a book comes from (an endpoint, an import): the HTTP limits are the route's
 */
import { z } from "zod";

export const titleSchema = z.string().min(1);

export const authorSchema = z.string().min(1);

/** Yen, tax included, a whole number. The table checks it too */
export const priceSchema = z.int().min(1);

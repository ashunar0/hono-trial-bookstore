import { z } from "zod";
import type { booksTable } from "#/db/schema";

type BookRow = typeof booksTable.$inferSelect;

/** The stock a book shows. Staff send the version back with PUT /books/:id/stock */
export const stockResponseSchema = z.object({ quantity: z.number(), version: z.number() });

type Stock = z.infer<typeof stockResponseSchema>;

/** GET /books/:id, after a write, and a line of GET /books */
export const bookResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  price: z.number(),
  stock: stockResponseSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const bookResponse = (row: BookRow, stock: Stock): z.infer<typeof bookResponseSchema> => ({
  id: row.id,
  title: row.title,
  author: row.author,
  price: row.price,
  stock,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

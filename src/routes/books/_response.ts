import { z } from "zod";
import type { booksTable } from "#/db/schema";

type BookRow = typeof booksTable.$inferSelect;

/** GET /books/:id, after a write, and a line of GET /books */
export const bookResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  price: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const bookResponse = (row: BookRow): z.infer<typeof bookResponseSchema> => ({
  id: row.id,
  title: row.title,
  author: row.author,
  price: row.price,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

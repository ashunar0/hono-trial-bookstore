import { eq } from "drizzle-orm";
import type { Db } from "#/db/index";
import { booksTable } from "#/db/schema";

type BookRow = typeof booksTable.$inferInsert;

export const insertBook = (db: Db, row: BookRow) => db.insert(booksTable).values(row);

/** No row back when there is no such book */
export const updateBook = (
  db: Db,
  id: string,
  values: Pick<BookRow, "title" | "author" | "price" | "updatedAt">,
) => db.update(booksTable).set(values).where(eq(booksTable.id, id)).returning();

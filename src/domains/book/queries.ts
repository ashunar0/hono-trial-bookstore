import { and, desc, eq, lt, or } from "drizzle-orm";
import { toPage, type PageQuery } from "hono-kit/page";
import type { Db } from "#/db/index";
import { booksTable } from "#/db/schema";

/** Newest first */
export const listBooks = async (db: Db, query: PageQuery) => {
  const { after, limit } = query;
  const rows = await db
    .select()
    .from(booksTable)
    .where(
      after === undefined
        ? undefined
        : or(
            lt(booksTable.createdAt, after.at),
            and(eq(booksTable.createdAt, after.at), lt(booksTable.id, after.id)),
          ),
    )
    .orderBy(desc(booksTable.createdAt), desc(booksTable.id))
    .limit(limit + 1);
  return toPage(rows, limit, (row) => ({ at: row.createdAt, id: row.id }));
};

export const findBook = async (db: Db, id: string) => {
  const [row] = await db.select().from(booksTable).where(eq(booksTable.id, id)).limit(1);
  return row;
};

import { inArray } from "drizzle-orm";
import type { Db } from "#/db/index";
import { stocksTable } from "#/db/schema";
import { noStock } from "./rules";

/** The stock of each book asked for. A book with no row has noStock */
export const stocksOf = async (db: Db, bookIds: string[]) => {
  const rows =
    bookIds.length === 0
      ? []
      : await db.select().from(stocksTable).where(inArray(stocksTable.bookId, bookIds));
  const found = new Map(rows.map((row) => [row.bookId, row]));
  return new Map(
    bookIds.map((id) => {
      const row = found.get(id);
      return [id, row === undefined ? noStock : { quantity: row.quantity, version: row.version }];
    }),
  );
};

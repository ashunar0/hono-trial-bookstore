import { and, eq, isNull } from "drizzle-orm";
import { updateWithVersion } from "hono-kit/sqlite";
import type { Db } from "#/db/index";
import { returnLinesTable, returnsTable } from "#/db/schema";

/** The return and its lines. Run in one batch */
export const insertReturn = (
  db: Db,
  row: typeof returnsTable.$inferInsert,
  lines: (typeof returnLinesTable.$inferInsert)[],
) => [db.insert(returnsTable).values(row), db.insert(returnLinesTable).values(lines)] as const;

/** No row back when the version is no longer the one read */
export const updateReturn = (
  db: Db,
  at: { id: string; version: number },
  values: Partial<Omit<typeof returnsTable.$inferInsert, "id" | "version">>,
) => updateWithVersion(db, returnsTable, at, values);

/** Records that a completed return's stock and points are back. Not a change anyone sees, so the version stays */
export const markReturnRestored = (db: Db, id: string, at: Date) =>
  db
    .update(returnsTable)
    .set({ restoredAt: at })
    .where(and(eq(returnsTable.id, id), isNull(returnsTable.restoredAt)));

import type { Db } from "#/db/index";
import type { returnsTable } from "#/db/schema";
import { returnLinesOf } from "#/domains/return/index";
import { returnResponse } from "./_response";

/** One return as it is shown */
export const readReturn = async (db: Db, row: typeof returnsTable.$inferSelect) =>
  returnResponse(row, await returnLinesOf(db, [row.id]));

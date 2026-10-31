import type { Db } from "#/db/index";
import type { exchangesTable } from "#/db/schema";
import { exchangeLinesOf } from "#/domains/return/index";
import { exchangeResponse } from "./_response";

/** One exchange as it is shown */
export const readExchange = async (db: Db, row: typeof exchangesTable.$inferSelect) =>
  exchangeResponse(row, await exchangeLinesOf(db, [row.id]));

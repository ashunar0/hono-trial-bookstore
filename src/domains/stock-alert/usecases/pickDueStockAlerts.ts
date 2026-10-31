import type { DepsVariables } from "hono-kit";
import { stocksOf } from "#/domains/inventory/index";
import type { Db } from "#/db/index";
import { sendingAlerts, waitingAlertsOf, waitingBookIds } from "../queries";
import { inStock } from "../rules";

/** How many books are asked about at once (D1 takes few bound values in one query) */
const booksAtOnce = 50;

/**
 * The waiting alerts whose book is in stock now, oldest first. Stock is inventory's, so it is asked of inventory
 * (not joined in SQL), a few books at a time, until there are enough
 */
const waitingInStock = async (db: Db, limit: number) => {
  const picked: { id: string }[] = [];
  const books = await waitingBookIds(db);
  for (let from = 0; from < books.length && picked.length < limit; from += booksAtOnce) {
    const stocks = await stocksOf(db, books.slice(from, from + booksAtOnce));
    const back = [...stocks].filter(([, stock]) => inStock(stock.quantity)).map(([id]) => id);
    picked.push(...(await waitingAlertsOf(db, back, limit - picked.length)));
  }
  return picked;
};

/**
 * The alerts to send now, at most `limit` together: the ones started and not finished first, then the waiting ones
 * whose book is back. It writes nothing; it is a usecase because it decides from another domain's stock.
 * The ones already being sent are read before any is sent, so a mail that fails in this run is not tried again in it
 */
export const pickDueStockAlerts = async (deps: DepsVariables["deps"], input: { limit: number }) => {
  const { db } = deps;
  const retries = await sendingAlerts(db, input.limit);
  const fresh = await waitingInStock(db, input.limit - retries.length);
  return [...retries, ...fresh];
};

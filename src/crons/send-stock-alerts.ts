import { createCron } from "hono-kit";
import { stocksOf } from "#/domains/inventory/index";
import {
  sendingAlerts,
  sendStockAlert,
  waitingAlertsOf,
  waitingBookIds,
} from "#/domains/stock-alert/index";
import { inStock } from "#/domains/stock-alert/rules";
import type { Db } from "#/db/index";

/** How many alerts one run takes, the ones being sent and the fresh ones together; the rest wait for the next run */
const perRun = 100;

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
 * Every 15 minutes: sends the mail of the alerts whose book is back, and tries again the ones started and not
 * finished. It writes nothing itself: sendStockAlert does, and is safe to call again on the same alert.
 * The ones already being sent are read first, so a mail that fails in this run is not tried again in it: the next run
 * picks it up.
 * One that throws does not stop the rest (the next run would pick the same one first and stop there again): the run
 * goes on, then fails with every error, so the failure is still seen
 */
export const cron = createCron({ schedule: "*/15 * * * *" }, async ({ deps, now }) => {
  const errors: unknown[] = [];
  const each = async (id: string) => {
    try {
      await sendStockAlert(deps, { id, now });
    } catch (error) {
      errors.push(error);
    }
  };

  const retries = await sendingAlerts(deps.db, perRun);
  const fresh = await waitingInStock(deps.db, perRun - retries.length);
  for (const alert of [...retries, ...fresh]) await each(alert.id);

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, `${errors.length} stock alerts failed to send`);
});

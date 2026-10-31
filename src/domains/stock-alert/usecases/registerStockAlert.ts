import { err, NotFound, ok, type DepsVariables, type UserId } from "hono-kit";
import { uniqueViolationOf } from "hono-kit/sqlite";
import { findBook } from "#/domains/book/index";
import { stocksOf } from "#/domains/inventory/index";
import { insertAlert } from "../mutations";
import { findOpenAlert } from "../queries";
import { inStock, StockAvailable } from "../rules";

type Input = {
  customerId: UserId;
  /** Where the mail goes, kept with the alert */
  email: string;
  bookId: string;
  now: Date;
};

/**
 * The customer asks to be told when the book is back. 404 no such book → the customer already waits: that alert, as
 * it is (asking twice is the same ask) → 409 the book is in stock. The one-per-book rule is the unique index, so two
 * asks at once make one alert and both get it
 */
export const registerStockAlert = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  if ((await findBook(db, input.bookId)) === undefined) return err(NotFound.code);

  const existing = await findOpenAlert(db, input.customerId, input.bookId);
  if (existing !== undefined) return ok(existing);

  const stock = (await stocksOf(db, [input.bookId])).get(input.bookId);
  if (stock !== undefined && inStock(stock.quantity)) return err(StockAvailable.code);

  try {
    const [created] = await insertAlert(db, {
      id: crypto.randomUUID(),
      customerId: input.customerId,
      bookId: input.bookId,
      email: input.email,
      status: "waiting",
      attempts: 0,
      createdAt: input.now,
    });
    return ok(created!);
  } catch (error) {
    if (uniqueViolationOf(error) !== "stock_alerts.customer_id, stock_alerts.book_id") throw error;
    // The other ask got in between our read and our write: it is the customer's alert
    const winner = await findOpenAlert(db, input.customerId, input.bookId);
    if (winner === undefined) throw error;
    return ok(winner);
  }
};

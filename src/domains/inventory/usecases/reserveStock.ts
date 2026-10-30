import { err, ok, type DepsVariables } from "hono-kit";
import { uniqueViolationOf } from "hono-kit/sqlite";
import { holdStock } from "../mutations";
import { stocksOf } from "../queries";
import { OutOfStock } from "../rules";

type Input = {
  /** Made by the caller and kept by it, so it can give the hold back whatever happens after */
  reservationId: string;
  lines: { bookId: string; quantity: number }[];
  now: Date;
};

/** The books short, read now */
const shortOf = async (db: DepsVariables["deps"]["db"], lines: Input["lines"]) => {
  const stocks = await stocksOf(
    db,
    lines.map((line) => line.bookId),
  );
  return lines.flatMap((line) => {
    const available = stocks.get(line.bookId)?.quantity ?? 0;
    return available < line.quantity
      ? [{ bookId: line.bookId, requested: line.quantity, available }]
      : [];
  });
};

/**
 * Holds every line's stock, or none: OUT_OF_STOCK with the books short. Run again with the same id, it holds nothing
 * more. The read first gives the details; the CHECK on the stock stops an order that got in between
 */
export const reserveStock = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const short = await shortOf(db, input.lines);
  if (short.length > 0) return err({ code: OutOfStock.code, details: { books: short } });

  try {
    await db.batch(holdStock(db, input, input.lines));
  } catch (error) {
    if (uniqueViolationOf(error) === "reservations.id")
      return ok({ reservationId: input.reservationId });
    // Another order took the stock between the read and the batch
    const nowShort = await shortOf(db, input.lines);
    if (nowShort.length > 0) return err({ code: OutOfStock.code, details: { books: nowShort } });
    throw error;
  }

  return ok({ reservationId: input.reservationId });
};

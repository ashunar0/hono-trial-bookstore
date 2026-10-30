import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { findBook } from "#/domains/book/index";
import { insertStock, updateStock } from "../mutations";
import { StockChanged } from "../rules";

type Input = {
  bookId: string;
  /** The version the client read. 0 is a book with no stock row yet */
  version: number;
  quantity: number;
  now: Date;
};

/** Staff set the count after counting the shelf. 404 → the version */
export const setStock = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  if ((await findBook(db, input.bookId)) === undefined) return err(NotFound.code);

  const values = { quantity: input.quantity, updatedAt: input.now };
  const [row] =
    input.version === 0
      ? await insertStock(db, { bookId: input.bookId, ...values, version: 1 })
      : await updateStock(db, { bookId: input.bookId, version: input.version }, values);
  if (row === undefined) return err(StockChanged.code);

  return ok({ quantity: row.quantity, version: row.version });
};

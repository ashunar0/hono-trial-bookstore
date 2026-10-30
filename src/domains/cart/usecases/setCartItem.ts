import { err, NotFound, ok, type DepsVariables, type UserId } from "hono-kit";
import { findBook } from "#/domains/book/index";
import { upsertCartItem } from "../mutations";

type Input = { customerId: UserId; bookId: string; quantity: number; now: Date };

/** 404 for a book that does not exist */
export const setCartItem = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  if ((await findBook(db, input.bookId)) === undefined) return err(NotFound.code);

  const [row] = await upsertCartItem(db, {
    customerId: input.customerId,
    bookId: input.bookId,
    quantity: input.quantity,
    addedAt: input.now,
  });
  if (row === undefined) throw new Error("an upsert returns its row");

  return ok(row);
};

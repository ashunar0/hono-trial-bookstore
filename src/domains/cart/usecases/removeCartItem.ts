import { err, NotFound, ok, type DepsVariables, type UserId } from "hono-kit";
import { deleteCartItem } from "../mutations";

type Input = { customerId: UserId; bookId: string };

/** 404 when the book is not in the cart */
export const removeCartItem = async (deps: DepsVariables["deps"], input: Input) => {
  const [row] = await deleteCartItem(deps.db, input.customerId, input.bookId);
  if (row === undefined) return err(NotFound.code);

  return ok(row);
};

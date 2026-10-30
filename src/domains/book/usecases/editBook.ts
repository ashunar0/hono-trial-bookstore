import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { updateBook } from "../mutations";

type Input = {
  id: string;
  book: { title: string; author: string; price: number };
  now: Date;
};

/** No version: when two staff members edit at once, the later one wins */
export const editBook = async (deps: DepsVariables["deps"], input: Input) => {
  const [row] = await updateBook(deps.db, input.id, { ...input.book, updatedAt: input.now });
  if (row === undefined) return err(NotFound.code);

  return ok(row);
};

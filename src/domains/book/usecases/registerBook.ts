import { ok, type DepsVariables } from "hono-kit";
import { insertBook } from "../mutations";

type Input = {
  book: { title: string; author: string; price: number };
  now: Date;
};

export const registerBook = async (deps: DepsVariables["deps"], input: Input) => {
  const row = {
    id: crypto.randomUUID(),
    ...input.book,
    createdAt: input.now,
    updatedAt: input.now,
  };
  await insertBook(deps.db, row);

  return ok(row);
};

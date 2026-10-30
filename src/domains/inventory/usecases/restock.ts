import { ok, type DepsVariables } from "hono-kit";
import { uniqueViolationOf } from "hono-kit/sqlite";
import { putBack } from "../mutations";

type Input = {
  /** Made by the caller (a return's id): the stock goes back once per id */
  restockId: string;
  lines: { bookId: string; quantity: number }[];
  now: Date;
};

/** Puts books back on the shelf. Safe to run again with the same id */
export const restock = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  try {
    await db.batch(putBack(db, input, input.lines));
  } catch (error) {
    if (uniqueViolationOf(error) !== "restocks.id") throw error;
  }

  return ok({ restockId: input.restockId });
};

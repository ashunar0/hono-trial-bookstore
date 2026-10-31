import { ok, type DepsVariables, type UserId } from "hono-kit";
import { record } from "./_record";

type Input = {
  /** Fixed by what is given back (restoreIdOfUse, restoreIdOfReturn): once per id */
  restoreId: string;
  customerId: UserId;
  /** 0 gives back nothing */
  points: number;
  now: Date;
};

/** Gives points back to the customer. Safe to run again with the same id, and with 0 */
export const restorePoints = async (deps: DepsVariables["deps"], input: Input) => {
  if (input.points > 0)
    await record(deps, {
      id: input.restoreId,
      customerId: input.customerId,
      kind: "restore",
      amount: input.points,
      now: input.now,
    });

  return ok({ restoreId: input.restoreId });
};

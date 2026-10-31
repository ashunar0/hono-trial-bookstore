import { ok, type DepsVariables, type UserId } from "hono-kit";
import { record } from "./_record";

type Input = {
  /** Fixed by what is given back (restoreIdOfReturn): once per id */
  restoreId: string;
  customerId: UserId;
  /** 0 gives back nothing */
  points: number;
  now: Date;
};

/**
 * Gives points back to the customer, a part of what they used (the points of a returned book). Safe to run again with
 * the same id, and with 0. To give back a whole use, restorePointsOfUse reads the use and cannot give back more
 */
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

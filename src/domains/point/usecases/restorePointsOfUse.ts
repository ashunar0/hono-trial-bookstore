import { ok, type DepsVariables, type UserId } from "hono-kit";
import { findEntry } from "../queries";
import { restoreIdOfUse } from "../rules";
import { record } from "./_record";

type Input = {
  /** The id the use was made with */
  useId: string;
  customerId: UserId;
  now: Date;
};

/**
 * Gives back all the points a use took. A use that was never made (the placing stopped before it) gives back nothing:
 * the points to give back are read from the use itself, so they cannot be made out of nothing. Safe to run again,
 * and safe to run before the use if the use is still on its way (run again after it)
 */
export const restorePointsOfUse = async (deps: DepsVariables["deps"], input: Input) => {
  const used = await findEntry(deps.db, input.useId);
  if (used !== undefined && used.kind === "use")
    await record(deps, {
      id: restoreIdOfUse(input.useId),
      customerId: input.customerId,
      kind: "restore",
      amount: -used.amount,
      now: input.now,
    });

  return ok({ useId: input.useId });
};

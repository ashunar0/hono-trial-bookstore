import { err, ok, type DepsVariables, type UserId } from "hono-kit";
import { balanceOf } from "../queries";
import { PointsInsufficient } from "../rules";
import { record } from "./_record";

type Input = {
  /** Made by the caller and kept by it, so it can give the points back */
  useId: string;
  customerId: UserId;
  /** A whole number, 1 or more (the caller checks it against the total) */
  points: number;
  now: Date;
};

/**
 * Takes points off the customer's balance. POINTS_INSUFFICIENT when the balance does not cover it, also when another
 * order took them between the read and the write (the balance CHECK stops that one). Run again with the same id,
 * nothing more is taken
 */
export const usePoints = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  try {
    await record(deps, {
      id: input.useId,
      customerId: input.customerId,
      kind: "use",
      amount: -input.points,
      now: input.now,
    });
  } catch (error) {
    const balance = await balanceOf(db, input.customerId);
    if (balance < input.points) return err({ code: PointsInsufficient.code, details: { balance } });
    throw error;
  }

  return ok({ useId: input.useId });
};

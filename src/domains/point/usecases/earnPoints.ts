import { ok, type DepsVariables, type UserId } from "hono-kit";
import { earnedOf } from "../rules";
import { record } from "./_record";

type Input = {
  /** Made by the caller and kept by it: an order earns once */
  earnId: string;
  customerId: UserId;
  /** The yen the points are earned on (the rate is point's own) */
  yen: number;
  now: Date;
};

/** The customer earns points on `yen`. Safe to run again with the same id, and when nothing is earned (under 100 yen) */
export const earnPoints = async (deps: DepsVariables["deps"], input: Input) => {
  const points = earnedOf(input.yen);
  if (points > 0)
    await record(deps, {
      id: input.earnId,
      customerId: input.customerId,
      kind: "earn",
      amount: points,
      now: input.now,
    });

  return ok({ earnId: input.earnId, points });
};

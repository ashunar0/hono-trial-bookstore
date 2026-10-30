import { ok, type DepsVariables } from "hono-kit";
import { giveBackHold } from "../mutations";

type Input = { reservationId: string; now: Date };

/** Gives the hold's stock back. Safe to run again, and on a hold that was never made */
export const releaseReservation = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  await db.batch(giveBackHold(db, input));

  return ok({ reservationId: input.reservationId });
};

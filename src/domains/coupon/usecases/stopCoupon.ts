import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { markStopped } from "../mutations";
import { findCoupon } from "../queries";

type Input = { id: string; now: Date };

/** Stopping one already stopped changes nothing and is not a failure: it is stopped either way */
export const stopCoupon = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const found = await findCoupon(db, input.id);
  if (found === undefined) return err(NotFound.code);
  if (found.stoppedAt !== null) return ok(found);

  const [row] = await markStopped(db, input.id, input.now);
  // Stopped by someone else in between: theirs stays
  return ok(row ?? (await findCoupon(db, input.id)) ?? found);
};

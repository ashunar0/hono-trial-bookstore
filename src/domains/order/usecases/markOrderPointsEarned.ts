import { ok, type DepsVariables } from "hono-kit";
import { markPointsEarned } from "../mutations";

/** Records that the points of a closed order are earned. Temporary: return_windows takes this */
export const markOrderPointsEarned = async (
  deps: DepsVariables["deps"],
  input: { id: string; now: Date },
) => {
  await markPointsEarned(deps.db, input.id, input.now);

  return ok({ id: input.id });
};

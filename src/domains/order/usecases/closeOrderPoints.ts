import { ok, type DepsVariables } from "hono-kit";
import { updateOrder } from "../mutations";
import { conflictNow } from "./_conflictNow";

/** Records that the points of the order are closed (the version moves). Temporary: return_windows takes this */
export const closeOrderPoints = async (
  deps: DepsVariables["deps"],
  input: { id: string; version: number; now: Date },
) => {
  const [closed] = await updateOrder(
    deps.db,
    { id: input.id, version: input.version },
    { pointsClosedAt: input.now, updatedAt: input.now },
  );
  if (closed === undefined) return conflictNow(deps.db, input.id);

  return ok(closed);
};

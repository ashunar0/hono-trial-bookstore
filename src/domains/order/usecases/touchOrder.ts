import { ok, type DepsVariables } from "hono-kit";
import { updateOrder } from "../mutations";
import { conflictNow } from "./_conflictNow";

/**
 * Moves the order's version without changing what anyone sees, so a request that read the order before loses to the
 * one that moved it (409). Temporary: return_windows takes this job from the order
 */
export const touchOrder = async (
  deps: DepsVariables["deps"],
  input: { id: string; version: number; now: Date },
) => {
  const [moved] = await updateOrder(
    deps.db,
    { id: input.id, version: input.version },
    { updatedAt: input.now },
  );
  if (moved === undefined) return conflictNow(deps.db, input.id);

  return ok(moved);
};

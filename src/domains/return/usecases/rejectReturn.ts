import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { updateReturn } from "../mutations";
import { findReturn } from "../queries";
import { ReturnStatusConflict } from "../rules";

/** Staff turn the return down with a reason. Its copies can be asked back again */
export const rejectReturn = async (
  deps: DepsVariables["deps"],
  input: { returnId: string; reason: string; now: Date },
) => {
  const { db } = deps;
  const found = await findReturn(db, input.returnId);
  if (found === undefined) return err(NotFound.code);
  if (found.status !== "requested")
    return err({ code: ReturnStatusConflict.code, details: { status: found.status } });

  const [rejected] = await updateReturn(
    db,
    { id: found.id, version: found.version },
    { status: "rejected", rejectReason: input.reason, rejectedAt: input.now },
  );
  if (rejected === undefined) {
    const current = await findReturn(db, found.id);
    return err({
      code: ReturnStatusConflict.code,
      details: { status: current?.status ?? found.status },
    });
  }

  return ok(rejected);
};

import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { releaseReservation } from "#/domains/inventory/index";
import { updateExchange } from "../mutations";
import { findExchange } from "../queries";
import { ExchangeStatusConflict, reservationIdOfExchange } from "../rules";
import { exchangeConflictNow } from "./_exchangeConflict";

/**
 * Staff turn the exchange down with a reason (the copies were not damaged). Its copies can be asked back again.
 * 1 rejected (version) → 2 any hold under the exchange's id goes back: a receive that held copies and stopped before
 * switching left one, and nothing is left when there is none
 */
export const rejectExchange = async (
  deps: DepsVariables["deps"],
  input: { exchangeId: string; reason: string; now: Date },
) => {
  const { db } = deps;
  const found = await findExchange(db, input.exchangeId);
  if (found === undefined) return err(NotFound.code);
  if (found.status !== "requested")
    return err({ code: ExchangeStatusConflict.code, details: { status: found.status } });

  const [rejected] = await updateExchange(
    db,
    { id: found.id, version: found.version },
    { status: "rejected", rejectReason: input.reason, rejectedAt: input.now },
  );
  if (rejected === undefined) return exchangeConflictNow(db, found);

  await releaseReservation(deps, {
    reservationId: reservationIdOfExchange(found.id),
    now: input.now,
  });

  return ok(rejected);
};

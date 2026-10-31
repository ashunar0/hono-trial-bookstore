import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { releaseReservation } from "#/domains/inventory/index";
import { markExchangeRestored, updateExchange } from "../mutations";
import { findExchange } from "../queries";
import { ExchangeStatusConflict, reservationIdOfExchange } from "../rules";
import { exchangeConflictNow } from "./_exchangeConflict";

/**
 * Staff turn the exchange down with a reason (the copies were not damaged). Its copies can be asked back again.
 * It lets go, so the switch is first: 1 rejected (version) → 2 any hold under the exchange's id goes back (a receive
 * that held copies and stopped before switching left one; nothing when there is none) → record it is all back.
 * The cron finishes a reject that stopped before that record
 */
export const rejectExchange = async (
  deps: DepsVariables["deps"],
  input: { exchangeId: string; now: Date } & ({ by: "staff"; reason: string } | { by: "cron" }),
) => {
  const { db } = deps;
  const found = await findExchange(db, input.exchangeId);
  if (found === undefined) return err(NotFound.code);
  const finishing = input.by === "cron" && found.status === "rejected" && found.restoredAt === null;
  if (!finishing && found.status !== "requested")
    return err({ code: ExchangeStatusConflict.code, details: { status: found.status } });

  if (!finishing) {
    if (input.by === "cron")
      return err({ code: ExchangeStatusConflict.code, details: { status: found.status } });
    const [rejected] = await updateExchange(
      db,
      { id: found.id, version: found.version },
      { status: "rejected", rejectReason: input.reason, rejectedAt: input.now },
    );
    if (rejected === undefined) return exchangeConflictNow(db, found);
  }

  await releaseReservation(deps, {
    reservationId: reservationIdOfExchange(found.id),
    now: input.now,
  });
  await markExchangeRestored(db, found.id, input.now);

  return ok((await findExchange(db, found.id)) ?? found);
};

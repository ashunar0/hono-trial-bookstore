import { err, NotFound, ok, type DepsVariables } from "hono-kit";
import { updateExchange } from "../mutations";
import { findExchange } from "../queries";
import { ExchangeStatusConflict } from "../rules";
import { exchangeConflictNow } from "./_exchangeConflict";

/** Staff send the copies held at the receive. Only a received exchange can be sent; the stock is not touched */
export const shipExchange = async (
  deps: DepsVariables["deps"],
  input: { exchangeId: string; now: Date },
) => {
  const { db } = deps;
  const found = await findExchange(db, input.exchangeId);
  if (found === undefined) return err(NotFound.code);
  if (found.status !== "received")
    return err({ code: ExchangeStatusConflict.code, details: { status: found.status } });

  const [shipped] = await updateExchange(
    db,
    { id: found.id, version: found.version },
    { status: "shipped", shippedAt: input.now },
  );
  if (shipped === undefined) return exchangeConflictNow(db, found);

  return ok(shipped);
};

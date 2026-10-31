import { err, type DepsVariables } from "hono-kit";
import { findExchange } from "../queries";
import { ExchangeStatusConflict, type ExchangeStatus } from "../rules";

/** A write lost to another after the read (the version moved): EXCHANGE_STATUS_CONFLICT with what it is now */
export const exchangeConflictNow = async (
  db: DepsVariables["deps"]["db"],
  found: { id: string; status: ExchangeStatus },
) => {
  const current = await findExchange(db, found.id);
  return err({
    code: ExchangeStatusConflict.code,
    details: { status: current?.status ?? found.status },
  });
};

import { err, NotFound, ok, type DepsVariables, type UserId } from "hono-kit";
import { deleteWaitingAlert } from "../mutations";
import { findOpenAlert } from "../queries";
import { canCancel, StockAlertStatusConflict } from "../rules";

type Input = { customerId: UserId; bookId: string };

/**
 * The customer takes back the ask they made on a book. 404 they have none waiting or sending → 409 it is sending.
 * The delete itself only takes a waiting row, so the cron starting to send in between loses nothing: it is 409
 */
export const cancelStockAlert = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const alert = await findOpenAlert(db, input.customerId, input.bookId);
  if (alert === undefined) return err(NotFound.code);
  if (!canCancel(alert.status))
    return err({ code: StockAlertStatusConflict.code, details: { status: alert.status } });

  const [deleted] = await deleteWaitingAlert(db, alert.id);
  if (deleted !== undefined) return ok({ id: deleted.id });

  // Not waiting any more: sending now (409), or cancelled by the same customer a moment ago (404)
  const now = await findOpenAlert(db, input.customerId, input.bookId);
  if (now === undefined) return err(NotFound.code);
  return err({ code: StockAlertStatusConflict.code, details: { status: now.status } });
};

import { ok, type DepsVariables } from "hono-kit";
import { findBook } from "#/domains/book/index";
import { stocksOf } from "#/domains/inventory/index";
import { finishAlert, startAttempt } from "../mutations";
import { findAlert } from "../queries";
import { inStock, isOpen, maxAttempts, restockMail } from "../rules";

type Input = { id: string; now: Date };

/**
 * Sends the mail of one alert, in three steps that can each be run again: record (sending, one more attempt) → call
 * the mailer → close (sent, or failed on the last attempt). The record comes first, so a run that dies between the
 * call and the close leaves "maybe sent" behind and the next run sends it again with the same key (a second mail is
 * better than none; the mailer's side drops the duplicate).
 *
 * The record only goes through while the alert is as this run read it (status and attempts): of two runs on the same
 * alert, or a run and a cancel, one wins and the other does nothing.
 * A waiting alert whose book is out of stock again is left waiting. A sending one is sent whatever the stock is.
 * One whose last attempt was started and never closed is given up (failed) without a fourth mail.
 * Never fails: what happened is in the returned outcome, and a mailer that does not answer is another attempt
 */
export const sendRestockAlert = async (deps: DepsVariables["deps"], input: Input) => {
  const { db, mailer } = deps;
  const alert = await findAlert(db, input.id);
  if (alert === undefined || !isOpen(alert.status)) return ok({ outcome: "skipped" as const });

  if (alert.status === "sending" && alert.attempts >= maxAttempts) {
    await finishAlert(db, alert.id, { status: "failed" });
    return ok({ outcome: "failed" as const });
  }
  if (alert.status === "waiting") {
    const stock = (await stocksOf(db, [alert.bookId])).get(alert.bookId);
    if (stock === undefined || !inStock(stock.quantity)) return ok({ outcome: "waiting" as const });
  }

  const [started] = await startAttempt(db, {
    id: alert.id,
    status: alert.status,
    attempts: alert.attempts,
  });
  if (started === undefined) return ok({ outcome: "skipped" as const });

  const book = await findBook(db, alert.bookId);
  if (book === undefined)
    throw new Error(`restock alert ${alert.id}: book ${alert.bookId} is gone`);
  const sent = await mailer.send({ key: alert.id, to: alert.email, ...restockMail(book.title) });

  if (sent.ok) {
    await finishAlert(db, alert.id, { status: "sent", sentAt: input.now });
    return ok({ outcome: "sent" as const });
  }
  if (started.attempts >= maxAttempts) {
    await finishAlert(db, alert.id, { status: "failed" });
    return ok({ outcome: "failed" as const });
  }
  return ok({ outcome: "retry" as const });
};

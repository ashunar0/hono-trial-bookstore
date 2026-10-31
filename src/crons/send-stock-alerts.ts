import { createCron } from "hono-kit";
import { pickDueStockAlerts, sendStockAlert } from "#/domains/stock-alert/index";

/** How many alerts one run takes, the ones being sent and the fresh ones together; the rest wait for the next run */
const perRun = 100;

/**
 * Every 15 minutes: sends the mail of the alerts whose book is back, and tries again the ones started and not
 * finished. It writes nothing itself: sendStockAlert does, and is safe to call again on the same alert.
 * One that throws does not stop the rest (the next run would pick the same one first and stop there again): the run
 * goes on, then fails with every error, so the failure is still seen
 */
export const cron = createCron({ schedule: "*/15 * * * *" }, async ({ deps, now }) => {
  const errors: unknown[] = [];
  for (const alert of await pickDueStockAlerts(deps, { limit: perRun })) {
    try {
      await sendStockAlert(deps, { id: alert.id, now });
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, `${errors.length} stock alerts failed to send`);
});

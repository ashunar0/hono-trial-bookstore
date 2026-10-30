import { serve } from "@hono/node-server";
import { Cron } from "croner";
import { runScheduled } from "hono-kit";
import { sweepOrders } from "./jobs/sweepOrders";
import { buildApp, makeDeps } from "./main";

/** Starts the server (pnpm dev, pnpm start). Kept apart from main.ts so tests can import the app without starting it */
const server = serve({ fetch: buildApp().fetch, port: Number(process.env.PORT ?? 3000) }, (info) =>
  console.log(`Listening on http://localhost:${info.port}`),
);

// sweepOrders (src/jobs): expired payments, orders left placing, cancels that stopped halfway.
// now is the time the run was due, as on Workers; protect skips a run while the last one is still going
const sweep = new Cron("*/15 * * * *", { protect: true }, async (self) => {
  await runScheduled(sweepOrders, { deps: makeDeps(), now: self.currentRun() ?? new Date() });
});

// Stop taking new work, finish the requests in flight, then close the database
const shutdown = () => {
  sweep.stop();
  server.close(() => {
    makeDeps().db.$client.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

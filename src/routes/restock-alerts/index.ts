import { createEndpoint, pageQuerySchema, pageResponse, pageResponseSchema } from "hono-kit";
import { requireRole } from "#/auth";
import { listAlerts } from "#/domains/restock/index";
import { alertResponse, alertResponseSchema } from "./_response";

/** The customer's own alerts, whatever their status (waiting, sending, sent, failed), newest first */
export const GET = createEndpoint(
  {
    auth: requireRole("customer"),
    request: { query: pageQuerySchema() },
    responses: { 200: pageResponseSchema(alertResponseSchema) },
  },
  async (c, reply) => {
    const page = await listAlerts(c.var.deps.db, c.var.currentUser.id, c.req.valid("query"));

    return reply.success(pageResponse(page, alertResponse));
  },
);

import { createEndpoint, pageQuerySchema, pageResponse, pageResponseSchema } from "hono-kit";
import { requireRole } from "#/auth";
import { listEntries } from "#/domains/point/index";
import { entryResponse, entryResponseSchema } from "../_response";

/** The customer's own statement (used, given back, earned), newest first */
export const GET = createEndpoint(
  {
    auth: requireRole("customer"),
    request: { query: pageQuerySchema() },
    responses: { 200: pageResponseSchema(entryResponseSchema) },
  },
  async (c, reply) => {
    const page = await listEntries(c.var.deps.db, c.var.currentUser.id, c.req.valid("query"));

    return reply.success(pageResponse(page, entryResponse));
  },
);

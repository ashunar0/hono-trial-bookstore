import { z } from "zod";
import {
  createEndpoint,
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
  requireAuth,
} from "hono-kit";
import { exchangeLinesOf, listExchanges } from "#/domains/return/index";
import { exchangeStatuses } from "#/domains/return/rules";
import { exchangeResponse, exchangeResponseSchema } from "./_response";

/** A customer sees their own exchanges, staff see all. Newest first; ?status=requested is what staff still have to decide */
export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { query: pageQuerySchema(z.object({ status: z.enum(exchangeStatuses).optional() })) },
    responses: { 200: pageResponseSchema(exchangeResponseSchema) },
  },
  async (c, reply) => {
    const { db } = c.var.deps;
    const { status, ...query } = c.req.valid("query");
    const user = c.var.currentUser;
    const customerId = user.role === "staff" ? undefined : user.id;
    const page = await listExchanges(db, { customerId, status }, query);
    const lines = await exchangeLinesOf(
      db,
      page.items.map((row) => row.id),
    );

    return reply.success(pageResponse(page, (row) => exchangeResponse(row, lines)));
  },
);

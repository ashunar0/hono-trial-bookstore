import { z } from "zod";
import { createEndpoint, pageQuerySchema, pageResponse, pageResponseSchema } from "hono-kit";
import { requireRole } from "#/auth";
import { listReturns, returnLinesOf } from "#/domains/return/index";
import { returnStatuses } from "#/domains/return/rules";
import { returnResponse, returnResponseSchema } from "./_response";

/** Newest first. ?status=requested is what is still waiting for staff */
export const GET = createEndpoint(
  {
    auth: requireRole("staff"),
    request: { query: pageQuerySchema(z.object({ status: z.enum(returnStatuses).optional() })) },
    responses: { 200: pageResponseSchema(returnResponseSchema) },
  },
  async (c, reply) => {
    const { db } = c.var.deps;
    const { status, ...query } = c.req.valid("query");
    const page = await listReturns(db, { status }, query);
    const lines = await returnLinesOf(
      db,
      page.items.map((row) => row.id),
    );

    return reply.success(pageResponse(page, (row) => returnResponse(row, lines)));
  },
);

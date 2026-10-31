import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { receiveExchange } from "#/domains/return/index";
import { ExchangeStatusConflict } from "#/domains/return/rules";
import { readExchange } from "../../_read";
import { exchangeResponseSchema } from "../../_response";

/**
 * Staff got the damaged copies: a copy of each book is held for the swap (received), or when none is left the money is
 * refunded (refunded). The damaged copies do not go back on the shelf
 */
export const POST = createEndpoint(
  {
    auth: requireRole("staff"),
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: exchangeResponseSchema, ...errorResponses(NotFound, ExchangeStatusConflict) },
  },
  async (c, reply) => {
    const result = await receiveExchange(c.var.deps, {
      exchangeId: c.req.valid("param").id,
      by: "staff",
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readExchange(c.var.deps.db, result.value));
  },
);

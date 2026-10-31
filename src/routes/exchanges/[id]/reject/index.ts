import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { rejectExchange } from "#/domains/return/index";
import { ExchangeStatusConflict } from "#/domains/return/rules";
import { readExchange } from "../../_read";
import { exchangeResponseSchema } from "../../_response";

/** Staff turn the exchange down, with a word on why (the copies were not damaged) */
export const POST = createEndpoint(
  {
    auth: requireRole("staff"),
    request: {
      param: z.object({ id: z.string() }),
      json: z.object({ reason: z.string().trim().min(1).max(200) }),
    },
    responses: { 200: exchangeResponseSchema, ...errorResponses(NotFound, ExchangeStatusConflict) },
  },
  async (c, reply) => {
    const result = await rejectExchange(c.var.deps, {
      exchangeId: c.req.valid("param").id,
      reason: c.req.valid("json").reason,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readExchange(c.var.deps.db, result.value));
  },
);

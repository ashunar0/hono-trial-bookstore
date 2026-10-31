import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { shipExchange } from "#/domains/return/index";
import { ExchangeStatusConflict } from "#/domains/return/rules";
import { readExchange } from "../../_read";
import { exchangeResponseSchema } from "../../_response";

/** Staff send the swapped copies. Only an exchange that was received can be sent */
export const POST = createEndpoint(
  {
    auth: requireRole("staff"),
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: exchangeResponseSchema, ...errorResponses(NotFound, ExchangeStatusConflict) },
  },
  async (c, reply) => {
    const result = await shipExchange(c.var.deps, {
      exchangeId: c.req.valid("param").id,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readExchange(c.var.deps.db, result.value));
  },
);

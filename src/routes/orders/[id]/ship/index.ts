import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { shipOrder } from "#/domains/order/index";
import { OrderStatusConflict } from "#/domains/order/rules";
import { readOrder } from "../../_read";
import { orderResponseSchema } from "../../_response";

/** Staff ship a paid order */
export const POST = createEndpoint(
  {
    auth: requireRole("staff"),
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: orderResponseSchema, ...errorResponses(NotFound, OrderStatusConflict) },
  },
  async (c, reply) => {
    const result = await shipOrder(c.var.deps, {
      id: c.req.valid("param").id,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readOrder(c.var.deps.db, result.value));
  },
);

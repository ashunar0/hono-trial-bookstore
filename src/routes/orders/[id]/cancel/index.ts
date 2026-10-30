import { z } from "zod";
import { createEndpoint, errorResponses, NotFound, requireAuth } from "hono-kit";
import { cancelOrder } from "#/domains/order/index";
import { OrderStatusConflict } from "#/domains/order/rules";
import { readOrder } from "../../_read";
import { orderResponseSchema } from "../../_response";

/**
 * Cancels before shipping: a customer their own, staff any. version is the one read: the order is cancelled
 * only as it was seen. A paid order gets its whole total back
 */
export const POST = createEndpoint(
  {
    auth: requireAuth,
    request: { param: z.object({ id: z.string() }), json: z.object({ version: z.int().min(1) }) },
    responses: { 200: orderResponseSchema, ...errorResponses(NotFound, OrderStatusConflict) },
  },
  async (c, reply) => {
    const user = c.var.currentUser;
    const result = await cancelOrder(c.var.deps, {
      id: c.req.valid("param").id,
      customerId: user.role === "staff" ? null : user.id,
      version: c.req.valid("json").version,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readOrder(c.var.deps.db, result.value));
  },
);

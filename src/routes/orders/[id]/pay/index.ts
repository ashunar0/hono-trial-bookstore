import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { payOrder } from "#/domains/order/index";
import { OrderStatusConflict, PaymentDeadlinePassed } from "#/domains/order/rules";
import { readOrder } from "../../_read";
import { orderResponseSchema } from "../../_response";

/** The customer pays their own order (stands in for a real payment). Staff cannot: 403 */
export const POST = createEndpoint(
  {
    auth: requireRole("customer"),
    request: { param: z.object({ id: z.string() }) },
    responses: {
      200: orderResponseSchema,
      ...errorResponses(NotFound, PaymentDeadlinePassed, OrderStatusConflict),
    },
  },
  async (c, reply) => {
    const result = await payOrder(c.var.deps, {
      customerId: c.var.currentUser.id,
      id: c.req.valid("param").id,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readOrder(c.var.deps.db, result.value.order));
  },
);

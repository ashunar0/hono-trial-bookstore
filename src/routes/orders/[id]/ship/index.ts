import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { shipAndOpenWindow } from "#/domains/return/index";
import { OrderStatusConflict } from "#/domains/order/rules";
import { readOrder } from "../../_read";
import { orderResponseSchema } from "../../_response";

/** Staff ship a paid order. Its return window opens with it (return's) */
export const POST = createEndpoint(
  {
    auth: requireRole("staff"),
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: orderResponseSchema, ...errorResponses(NotFound, OrderStatusConflict) },
  },
  async (c, reply) => {
    const result = await shipAndOpenWindow(c.var.deps, {
      id: c.req.valid("param").id,
      by: "staff",
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readOrder(c.var.deps.db, result.value));
  },
);

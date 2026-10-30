import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { stopCoupon } from "#/domains/coupon/index";
import { couponResponse, couponResponseSchema } from "../../_response";

/** From now on it cannot be used. Already stopped: nothing changes, 200 */
export const POST = createEndpoint(
  {
    auth: requireRole("staff"),
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: couponResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply) => {
    const result = await stopCoupon(c.var.deps, {
      id: c.req.valid("param").id,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(couponResponse(result.value));
  },
);

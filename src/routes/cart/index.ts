import { z } from "zod";
import { createEndpoint } from "hono-kit";
import { requireRole } from "#/auth";
import { cartResponseSchema, readCart } from "./_cart";

/** ?coupon=SPRING500 tries a coupon. One that does not apply is not a failure here: the estimate says why */
export const GET = createEndpoint(
  {
    auth: requireRole("customer"),
    request: { query: z.object({ coupon: z.string().min(1).optional() }) },
    responses: { 200: cartResponseSchema },
  },
  async (c, reply) => {
    const { coupon } = c.req.valid("query");

    return reply.success(await readCart(c.var.deps.db, c.var.currentUser.id, coupon, c.get("now")));
  },
);

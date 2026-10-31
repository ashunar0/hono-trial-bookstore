import { createEndpoint } from "hono-kit";
import { requireRole } from "#/auth";
import { balanceOf } from "#/domains/point/index";
import { balanceResponseSchema } from "./_response";

/** The customer's own balance. 0 until points are first earned */
export const GET = createEndpoint(
  {
    auth: requireRole("customer"),
    responses: { 200: balanceResponseSchema },
  },
  async (c, reply) => {
    const balance = await balanceOf(c.var.deps.db, c.var.currentUser.id);

    return reply.success({ balance });
  },
);

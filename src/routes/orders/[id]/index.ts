import { z } from "zod";
import { createEndpoint, errorResponses, NotFound, requireAuth } from "hono-kit";
import { findOrder } from "#/domains/order/index";
import { readOrder } from "../_read";
import { orderResponseSchema } from "../_response";

/** A customer sees their own; someone else's, and any order still being placed, is 404 */
export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: orderResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply) => {
    const { db } = c.var.deps;
    const user = c.var.currentUser;
    const order = await findOrder(db, c.req.valid("param").id);
    if (order === undefined || order.status === "placing") return reply.failure(NotFound.code);
    if (user.role !== "staff" && order.customerId !== user.id) return reply.failure(NotFound.code);

    return reply.success(await readOrder(db, order));
  },
);

import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { OrderStatusConflict } from "#/domains/order/rules";
import { requestReturn, returnLinesOf } from "#/domains/return/index";
import { ReturnPeriodEnded, ReturnQuantityExceeded } from "#/domains/return/rules";
import { returnResponse, returnResponseSchema } from "#/routes/returns/_response";

/** The customer asks to send books of their own shipped order back: which lines, how many copies of each */
export const POST = createEndpoint(
  {
    auth: requireRole("customer"),
    request: {
      param: z.object({ id: z.string() }),
      json: z.object({
        lines: z
          .array(z.object({ orderLineId: z.string(), quantity: z.int().min(1) }))
          .min(1)
          .refine((lines) => new Set(lines.map((l) => l.orderLineId)).size === lines.length, {
            message: "Each line once",
          }),
      }),
    },
    responses: {
      200: returnResponseSchema,
      ...errorResponses(NotFound, ReturnPeriodEnded, OrderStatusConflict, ReturnQuantityExceeded),
    },
  },
  async (c, reply) => {
    const result = await requestReturn(c.var.deps, {
      customerId: c.var.currentUser.id,
      orderId: c.req.valid("param").id,
      lines: c.req.valid("json").lines,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    const lines = await returnLinesOf(c.var.deps.db, [result.value.id]);

    return reply.success(returnResponse(result.value, lines));
  },
);

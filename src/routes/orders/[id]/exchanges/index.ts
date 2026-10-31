import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { OrderStatusConflict } from "#/domains/order/rules";
import { exchangeLinesOf, requestExchange } from "#/domains/return/index";
import { exchangeReasons, ReturnPeriodEnded, ReturnQuantityExceeded } from "#/domains/return/rules";
import { exchangeResponse, exchangeResponseSchema } from "#/routes/exchanges/_response";

/**
 * The customer asks to swap damaged copies of their own shipped order for others of the same books: why, and which
 * lines, how many copies of each. Money does not move
 */
export const POST = createEndpoint(
  {
    auth: requireRole("customer"),
    request: {
      param: z.object({ id: z.string() }),
      json: z.object({
        reason: z.enum(exchangeReasons),
        lines: z
          .array(z.object({ orderLineId: z.string(), quantity: z.int().min(1) }))
          .min(1)
          .refine((lines) => new Set(lines.map((l) => l.orderLineId)).size === lines.length, {
            message: "Each line once",
          }),
      }),
    },
    responses: {
      200: exchangeResponseSchema,
      ...errorResponses(NotFound, ReturnPeriodEnded, OrderStatusConflict, ReturnQuantityExceeded),
    },
  },
  async (c, reply) => {
    const result = await requestExchange(c.var.deps, {
      customerId: c.var.currentUser.id,
      orderId: c.req.valid("param").id,
      reason: c.req.valid("json").reason,
      lines: c.req.valid("json").lines,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    const lines = await exchangeLinesOf(c.var.deps.db, [result.value.id]);

    return reply.success(exchangeResponse(result.value, lines));
  },
);

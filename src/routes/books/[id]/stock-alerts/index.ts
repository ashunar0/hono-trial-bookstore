import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { cancelStockAlert, registerStockAlert } from "#/domains/stock-alert/index";
import { StockAlertStatusConflict, StockAvailable } from "#/domains/stock-alert/rules";
import { alertResponse, alertResponseSchema } from "../../../stock-alerts/_response";

const param = z.object({ id: z.string() });

/**
 * A customer asks to be told when the book is back. 409 while it is in stock (they can buy it now). Asking again
 * while the first ask is still to be sent answers 200 with that alert
 */
export const POST = createEndpoint(
  {
    auth: requireRole("customer"),
    request: { param },
    responses: { 200: alertResponseSchema, ...errorResponses(NotFound, StockAvailable) },
  },
  async (c, reply) => {
    const customer = c.var.currentUser;
    const result = await registerStockAlert(c.var.deps, {
      customerId: customer.id,
      email: customer.email,
      bookId: c.req.valid("param").id,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(alertResponse(result.value));
  },
);

/** Takes the ask back. 404 when none is waiting, 409 once it is being sent */
export const DELETE = createEndpoint(
  {
    auth: requireRole("customer"),
    request: { param },
    responses: {
      200: z.object({ ok: z.literal(true) }),
      ...errorResponses(NotFound, StockAlertStatusConflict),
    },
  },
  async (c, reply) => {
    const result = await cancelStockAlert(c.var.deps, {
      customerId: c.var.currentUser.id,
      bookId: c.req.valid("param").id,
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success({ ok: true });
  },
);

import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { cancelRestockAlert, registerRestockAlert } from "#/domains/restock/index";
import { RestockAlertStatusConflict, StockAvailable } from "#/domains/restock/rules";
import { alertResponse, alertResponseSchema } from "../../../restock-alerts/_response";

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
    const result = await registerRestockAlert(c.var.deps, {
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
      ...errorResponses(NotFound, RestockAlertStatusConflict),
    },
  },
  async (c, reply) => {
    const result = await cancelRestockAlert(c.var.deps, {
      customerId: c.var.currentUser.id,
      bookId: c.req.valid("param").id,
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success({ ok: true });
  },
);

import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { removeCartItem, setCartItem } from "#/domains/cart/index";
import { cartQuantitySchema } from "#/domains/cart/rules";
import { cartResponseSchema, readCart } from "../../_cart";

const param = z.object({ bookId: z.string() });

/** How many of the book: puts it in, or changes how many. Returns the cart */
export const PUT = createEndpoint(
  {
    auth: requireRole("customer"),
    request: { param, json: z.object({ quantity: cartQuantitySchema }) },
    responses: { 200: cartResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply) => {
    const customerId = c.var.currentUser.id;
    const result = await setCartItem(c.var.deps, {
      customerId,
      bookId: c.req.valid("param").bookId,
      quantity: c.req.valid("json").quantity,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readCart(c.var.deps.db, customerId, undefined, c.get("now")));
  },
);

/** Takes the book out. 404 when it is not in the cart */
export const DELETE = createEndpoint(
  {
    auth: requireRole("customer"),
    request: { param },
    responses: { 200: z.object({ ok: z.literal(true) }), ...errorResponses(NotFound) },
  },
  async (c, reply) => {
    const result = await removeCartItem(c.var.deps, {
      customerId: c.var.currentUser.id,
      bookId: c.req.valid("param").bookId,
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success({ ok: true });
  },
);

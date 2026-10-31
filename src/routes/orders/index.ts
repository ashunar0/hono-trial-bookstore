import { z } from "zod";
import {
  createEndpoint,
  errorResponses,
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
  requireAuth,
} from "hono-kit";
import { requireRole } from "#/auth";
import { CouponAlreadyUsed, CouponNotApplicable } from "#/domains/coupon/rules";
import { OutOfStock } from "#/domains/inventory/rules";
import { listOrders, placeOrder } from "#/domains/order/index";
import {
  CartEmpty,
  OrderStatusConflict,
  PointsExceedTotal,
  visibleStatuses,
} from "#/domains/order/rules";
import { PointsInsufficient } from "#/domains/point/rules";
import { orderResponse, orderResponseSchema, orderSummary, orderSummarySchema } from "./_response";

/** A customer sees their own, staff see every order. Newest first; ?status= narrows it */
export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { query: pageQuerySchema(z.object({ status: z.enum(visibleStatuses).optional() })) },
    responses: { 200: pageResponseSchema(orderSummarySchema) },
  },
  async (c, reply) => {
    const { status, ...page } = c.req.valid("query");
    const user = c.var.currentUser;
    const customerId = user.role === "staff" ? undefined : user.id;

    const orders = await listOrders(c.var.deps.db, { customerId, status }, page);

    return reply.success(pageResponse(orders, orderSummary));
  },
);

/**
 * The cart becomes an order, awaiting payment (paid at once when points cover the whole total).
 * couponCode and points (1 yen each) are optional
 */
export const POST = createEndpoint(
  {
    auth: requireRole("customer"),
    request: {
      json: z.object({
        couponCode: z.string().min(1).optional(),
        points: z.int().min(1).optional(),
      }),
    },
    responses: {
      200: orderResponseSchema,
      ...errorResponses(
        CartEmpty,
        CouponNotApplicable,
        PointsExceedTotal,
        OutOfStock,
        CouponAlreadyUsed,
        PointsInsufficient,
        OrderStatusConflict,
      ),
    },
  },
  async (c, reply) => {
    const result = await placeOrder(c.var.deps, {
      customerId: c.var.currentUser.id,
      couponCode: c.req.valid("json").couponCode,
      points: c.req.valid("json").points,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(orderResponse(result.value.order, result.value.lines, [], []));
  },
);

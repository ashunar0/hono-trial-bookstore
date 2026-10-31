import { err, ok, type DepsVariables, type UserId } from "hono-kit";
import { findBooks } from "#/domains/book/index";
import { cartItemsOf, emptyCart } from "#/domains/cart/index";
import { findCouponByCode, releaseCouponUse, useCoupon } from "#/domains/coupon/index";
import { CouponNotApplicable } from "#/domains/coupon/rules";
import { releaseReservation, reserveStock } from "#/domains/inventory/index";
import { usePoints } from "#/domains/point/index";
import { priceCart } from "#/domains/pricing/rules";
import { deleteOrder, insertOrder, updateOrder } from "../mutations";
import { findOrder } from "../queries";
import { giveBack } from "./_giveBack";
import {
  CartEmpty,
  OrderStatusConflict,
  PointsExceedTotal,
  allocateDiscount,
  allocatePoints,
  amountToPay,
  paymentDueOf,
} from "../rules";

type Input = {
  customerId: UserId;
  couponCode: string | undefined;
  /** Points to pay with, 1 or more. Undefined pays with none */
  points: number | undefined;
  now: Date;
};

/**
 * The cart becomes an order. The order switches to awaiting_payment last: until then nothing is promised.
 * 1 the order as placing, with the ids of the hold, the coupon use, the point use and the earning made here →
 * 2 hold the stock → 3 use the coupon → 4 use the points → 5 awaiting_payment (paid at once when the points
 * cover the whole total: nothing is left for the card) → 6 empty the cart.
 * Failing at 2, 3 or 4 takes back what was done and deletes the order. Stopping halfway (the Worker dies) leaves
 * a placing order with its ids, and the cron cancels it with them.
 * CART_EMPTY → COUPON_NOT_APPLICABLE → POINTS_EXCEED_TOTAL → OUT_OF_STOCK → COUPON_ALREADY_USED → POINTS_INSUFFICIENT
 */
export const placeOrder = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const { customerId, now } = input;

  const items = await cartItemsOf(db, customerId);
  if (items.length === 0) return err(CartEmpty.code);
  const books = await findBooks(
    db,
    items.map((i) => i.bookId),
  );
  const coupon =
    input.couponCode === undefined ? undefined : await findCouponByCode(db, input.couponCode);
  const { lines, ...money } = priceCart(
    items,
    books,
    input.couponCode === undefined ? null : { coupon },
    now,
  );
  if (money.notApplicable !== null)
    return err({ code: CouponNotApplicable.code, details: { reason: money.notApplicable } });
  const points = input.points ?? 0;
  if (points > money.total)
    return err({ code: PointsExceedTotal.code, details: { total: money.total } });
  const amounts = lines.map((line) => line.unitPrice * line.quantity);
  const discounts = allocateDiscount(amounts, money.discount);
  const shares = allocatePoints(
    amounts.map((amount, i) => amount - (discounts[i] ?? 0)),
    money.shippingFee,
    points,
  );

  // 1
  const order = {
    id: crypto.randomUUID(),
    customerId,
    status: "placing" as const,
    subtotal: money.subtotal,
    discount: money.discount,
    shippingFee: money.shippingFee,
    total: money.total,
    tax: money.tax,
    couponId: coupon?.id ?? null,
    couponCode: coupon?.code ?? null,
    reservationId: crypto.randomUUID(),
    couponUseId: coupon === undefined ? null : crypto.randomUUID(),
    pointsUsed: points,
    shippingPoints: shares.shipping,
    pointUseId: points === 0 ? null : crypto.randomUUID(),
    earnId: crypto.randomUUID(),
    paymentDueAt: paymentDueOf(now),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const orderLines = lines.map((line, i) => ({
    id: crypto.randomUUID(),
    orderId: order.id,
    ...line,
    discount: discounts[i] ?? 0,
    points: shares.lines[i] ?? 0,
    position: i,
  }));
  await db.batch(insertOrder(db, order, orderLines));

  // 2
  const held = await reserveStock(deps, { reservationId: order.reservationId, lines, now });
  if (!held.ok) {
    await db.batch(deleteOrder(db, order.id));
    return held;
  }

  // 3
  if (coupon !== undefined && order.couponUseId !== null) {
    const used = await useCoupon(deps, {
      useId: order.couponUseId,
      couponId: coupon.id,
      customerId,
      now,
    });
    if (!used.ok) {
      await releaseReservation(deps, { reservationId: order.reservationId, now });
      await db.batch(deleteOrder(db, order.id));
      return used;
    }
  }

  // 4
  if (order.pointUseId !== null) {
    const spent = await usePoints(deps, {
      useId: order.pointUseId,
      customerId,
      points,
      now,
    });
    if (!spent.ok) {
      if (order.couponUseId !== null)
        await releaseCouponUse(deps, { useId: order.couponUseId, now });
      await releaseReservation(deps, { reservationId: order.reservationId, now });
      await db.batch(deleteOrder(db, order.id));
      return spent;
    }
  }

  // 5. Only the cron touches a placing order, and only after 10 minutes. Nothing left for the card: paid, and the
  // payment is not asked at all
  const [placed] = await updateOrder(
    db,
    { id: order.id, version: order.version },
    amountToPay(order) === 0
      ? { status: "paid", paidAt: now, updatedAt: now }
      : { status: "awaiting_payment", updatedAt: now },
  );
  if (placed === undefined) {
    // The cron cancelled it first. It may have given back before this held or used anything: give back again.
    // A placing order was never paid, so there is no money to give back
    await giveBack(deps, { ...order, paidAt: null }, now);
    const current = await findOrder(db, order.id);
    return err({
      code: OrderStatusConflict.code,
      details: { status: current?.status ?? "cancelled" },
    });
  }

  // 6. The order stands even if this fails: the customer takes the books out by hand
  await emptyCart(deps, { customerId }).catch(() => undefined);

  return ok({ order: placed, lines: orderLines });
};

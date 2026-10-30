import { err, ok, type DepsVariables, type UserId } from "hono-kit";
import { findBooks } from "#/domains/book/index";
import { cartItemsOf, emptyCart } from "#/domains/cart/index";
import { findCouponByCode, useCoupon } from "#/domains/coupon/index";
import { CouponNotApplicable } from "#/domains/coupon/rules";
import { releaseReservation, reserveStock } from "#/domains/inventory/index";
import { estimate } from "#/domains/pricing/rules";
import { deleteOrder, insertOrder, updateOrder } from "../mutations";
import { findOrder } from "../queries";
import { CartEmpty, OrderStatusConflict, allocateDiscount, paymentDueOf } from "../rules";

type Input = { customerId: UserId; couponCode: string | undefined; now: Date };

/**
 * The cart becomes an order. The order switches to awaiting_payment last: until then nothing is promised.
 * 1 the order as placing, with the ids of the hold and the coupon use made here → 2 hold the stock →
 * 3 use the coupon → 4 awaiting_payment → 5 empty the cart.
 * Failing at 2 or 3 takes back what was done and deletes the order. Stopping halfway (the Worker dies) leaves
 * a placing order with its ids, and the cron cancels it with them.
 * CART_EMPTY → COUPON_NOT_APPLICABLE → OUT_OF_STOCK → COUPON_ALREADY_USED
 */
export const placeOrder = async (deps: DepsVariables["deps"], input: Input) => {
  const { db } = deps;
  const { customerId, now } = input;

  const items = await cartItemsOf(db, customerId);
  if (items.length === 0) return err(CartEmpty.code);
  const books = new Map(
    (
      await findBooks(
        db,
        items.map((i) => i.bookId),
      )
    ).map((b) => [b.id, b]),
  );
  const lines = items.flatMap((item) => {
    const book = books.get(item.bookId);
    return book === undefined
      ? []
      : [{ bookId: book.id, title: book.title, unitPrice: book.price, quantity: item.quantity }];
  });

  const coupon =
    input.couponCode === undefined ? undefined : await findCouponByCode(db, input.couponCode);
  const money = estimate(lines, input.couponCode === undefined ? null : { coupon }, now);
  if (money.notApplicable !== null)
    return err({ code: CouponNotApplicable.code, details: { reason: money.notApplicable } });
  const discounts = allocateDiscount(
    lines.map((line) => line.unitPrice * line.quantity),
    money.discount,
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

  // 4. Only the cron touches a placing order, and only after 10 minutes
  const [placed] = await updateOrder(
    db,
    { id: order.id, version: order.version },
    { status: "awaiting_payment", updatedAt: now },
  );
  if (placed === undefined) {
    const current = await findOrder(db, order.id);
    return err({
      code: OrderStatusConflict.code,
      details: { status: current?.status ?? "cancelled" },
    });
  }

  // 5. The order stands even if this fails: the customer takes the books out by hand
  await emptyCart(deps, { customerId }).catch(() => undefined);

  return ok({ order: placed, lines: orderLines });
};

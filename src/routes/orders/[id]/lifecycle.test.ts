import { expect, it } from "vitest";
import { carol, request, someone } from "../../../../test/fixtures";
import {
  bookWith,
  fixed500,
  inNovember,
  placedOrder,
  place,
  put,
  stockOf,
  type Order,
} from "../_test-helpers";

const at = (iso: string) => new Date(iso);
const pay = (who: Parameters<typeof request>[0], id: string, when = inNovember) =>
  request(who, "POST", `/orders/${id}/pay`, undefined, when);
const ship = (id: string) => request(carol, "POST", `/orders/${id}/ship`, undefined, inNovember);
const cancel = (who: Parameters<typeof request>[0], order: Order) =>
  request(who, "POST", `/orders/${order.id}/cancel`, { version: order.version }, inNovember);

it("awaiting payment → paid → shipped", async () => {
  const me = someone();
  const order = await placedOrder(me, await bookWith(1000, 5));

  const paid = await pay(me, order.id);
  expect(await paid.json()).toMatchObject({ status: "paid", paidAt: inNovember.toISOString() });

  const shipped = await ship(order.id);
  expect(await shipped.json()).toMatchObject({ status: "shipped" });
});

it("pay: 422 past the deadline, 409 when not awaiting payment, 404 for someone else's, 403 for staff", async () => {
  const me = someone();
  const order = await placedOrder(me, await bookWith(1000, 5));

  const late = await pay(me, order.id, at("2026-11-18T10:00:00+09:00"));
  expect(late.status).toBe(422);
  expect(await late.json()).toMatchObject({ error: { code: "PAYMENT_DEADLINE_PASSED" } });

  expect((await pay(someone(), order.id)).status).toBe(404);
  expect((await pay(carol, order.id)).status).toBe(403);

  await pay(me, order.id);
  const again = await pay(me, order.id);
  expect(again.status).toBe(409);
  expect(await again.json()).toMatchObject({
    error: { code: "ORDER_STATUS_CONFLICT", details: { status: "paid" } },
  });
});

it("ship: only a paid order, only staff", async () => {
  const me = someone();
  const order = await placedOrder(me, await bookWith(1000, 5));

  const unpaid = await ship(order.id);
  expect(await unpaid.json()).toMatchObject({
    error: { code: "ORDER_STATUS_CONFLICT", details: { status: "awaiting_payment" } },
  });
  expect((await request(me, "POST", `/orders/${order.id}/ship`)).status).toBe(403);
});

it("cancelling an unpaid order gives back the stock and the coupon; nothing is refunded", async () => {
  const me = someone();
  const book = await bookWith(3500, 5);
  const code = await fixed500();
  const order = await placedOrder(me, book, code);
  expect(await stockOf(book)).toBe(4);

  const res = await cancel(me, order);

  expect(await res.json()).toMatchObject({ status: "cancelled", refunds: [] });
  expect(await stockOf(book)).toBe(5);
  // The coupon can be used again
  await put(me, book, 1);
  expect((await place(me, code)).status).toBe(200);
});

it("cancelling a paid order refunds the whole total", async () => {
  const me = someone();
  const order = await placedOrder(me, await bookWith(2000, 5));
  const paid = (await (await pay(me, order.id)).json()) as Order;

  const res = await cancel(carol, paid);

  expect(await res.json()).toMatchObject({
    status: "cancelled",
    refunds: [{ returnId: null, amount: 2550, tax: 231 }],
  });
});

it("cancel: 409 for an old version (paid in between) and for a shipped order, 404 for someone else's", async () => {
  const me = someone();
  const book = await bookWith(1000, 5);
  const order = await placedOrder(me, book);

  expect((await cancel(someone(), order)).status).toBe(404);

  // Seen as awaiting payment; paid in between. The cancel loses, and the stock stays held
  await pay(me, order.id);
  const stale = await cancel(me, order);
  expect(await stale.json()).toMatchObject({
    error: { code: "ORDER_STATUS_CONFLICT", details: { status: "paid" } },
  });
  expect(await stockOf(book)).toBe(4);

  const shipped = (await (await ship(order.id)).json()) as Order;
  expect((await cancel(me, shipped)).status).toBe(409);
});

it("a payment after a cancel loses", async () => {
  const me = someone();
  const order = await placedOrder(me, await bookWith(1000, 5));
  await cancel(me, order);

  const res = await pay(me, order.id);

  expect(await res.json()).toMatchObject({
    error: { code: "ORDER_STATUS_CONFLICT", details: { status: "cancelled" } },
  });
});

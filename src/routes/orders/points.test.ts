import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { orderLinesTable, ordersTable } from "#/db/schema";
import { db, request, someone } from "../../../test/fixtures";
import {
  bookWith,
  fixed500,
  place,
  pointsOf,
  put,
  stockOf,
  withPoints,
  type Order,
} from "./_test-helpers";

const rowOf = async (id: string) => {
  const [order] = await db().select().from(ordersTable).where(eq(ordersTable.id, id));
  const lines = await db()
    .select()
    .from(orderLinesTable)
    .where(eq(orderLinesTable.orderId, id))
    .orderBy(orderLinesTable.position);
  return { order: order!, lines };
};

it("pays with points: part of the payment, not a discount (the design's example)", async () => {
  const me = someone();
  await put(me, await bookWith(3200, 5), 1);
  await withPoints(me, 600);

  const res = await place(me, undefined, 500);

  expect(res.status).toBe(200);
  const order = (await res.json()) as Order;
  // Shipping is still decided by 3,200, not by 2,700
  expect(order).toMatchObject({
    status: "awaiting_payment",
    discount: 0,
    shippingFee: 0,
    total: 3200,
    tax: 290,
  });
  expect((await rowOf(order.id)).order).toMatchObject({ pointsUsed: 500, shippingPoints: 0 });
  expect(await pointsOf(me)).toBe(100);
});

it("shares the points over the lines and the shipping fee (323 and 177)", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  await withPoints(me, 500);

  const order = (await (await place(me, undefined, 500)).json()) as Order;

  const row = await rowOf(order.id);
  expect(row.order).toMatchObject({ total: 1550, pointsUsed: 500, shippingPoints: 177 });
  expect(row.lines.map((line) => line.points)).toEqual([323]);
});

it("shares the points by the amount after the coupon (the design's fixed coupon example)", async () => {
  const me = someone();
  await put(me, await bookWith(2000, 5), 1);
  await put(me, await bookWith(1500, 5), 1);
  await withPoints(me, 1000);

  const order = (await (await place(me, await fixed500(), 1000)).json()) as Order;

  // 1,715 and 1,285 after the discount of 285 and 215; the total is 3,000 with no shipping
  const row = await rowOf(order.id);
  expect(row.order).toMatchObject({ total: 3000, pointsUsed: 1000, shippingPoints: 0 });
  // 1,715 / 3,000 of 1,000 is 571.6: the first line drops the fraction and the last takes the rest
  expect(row.lines.map((line) => [line.unitPrice, line.points])).toEqual([
    [2000, 571],
    [1500, 429],
  ]);
});

it("paying the whole total with points makes the order paid at once", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  await withPoints(me, 1550);

  const res = await place(me, undefined, 1550);

  const order = (await res.json()) as Order;
  expect(order).toMatchObject({ status: "paid", total: 1550, paidAt: expect.any(String) });
  expect(await pointsOf(me)).toBe(0);
  // It is paid, so paying again is a conflict
  const again = await request(me, "POST", `/orders/${order.id}/pay`);
  expect(again.status).toBe(409);
});

it("answers 422 POINTS_EXCEED_TOTAL with the total, and holds and uses nothing", async () => {
  const me = someone();
  const book = await bookWith(1000, 5);
  await put(me, book, 1);
  await withPoints(me, 5000);

  const res = await place(me, undefined, 1551);

  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({
    error: { code: "POINTS_EXCEED_TOTAL", details: { total: 1550 } },
  });
  expect(await stockOf(book)).toBe(5);
  expect(await pointsOf(me)).toBe(5000);
});

it("answers 400 to less than 1 point", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);

  expect((await place(me, undefined, 0)).status).toBe(400);
  expect((await place(me, undefined, -3)).status).toBe(400);
});

it("answers 409 POINTS_INSUFFICIENT with the balance, and gives back the stock and the coupon it took", async () => {
  const me = someone();
  const book = await bookWith(3500, 5);
  const code = await fixed500();
  await put(me, book, 1);
  await withPoints(me, 100);

  const res = await place(me, code, 101);

  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({
    error: { code: "POINTS_INSUFFICIENT", details: { balance: 100 } },
  });
  expect(await stockOf(book)).toBe(5);
  expect(await pointsOf(me)).toBe(100);
  // The coupon was given back: the same cart places with it
  expect((await place(me, code, 100)).status).toBe(200);
  const list = (await (await request(me, "GET", "/orders")).json()) as { items: Order[] };
  expect(list.items).toHaveLength(1);
});

it("a customer who never had points cannot use any", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);

  const res = await place(me, undefined, 1);

  expect(await res.json()).toMatchObject({
    error: { code: "POINTS_INSUFFICIENT", details: { balance: 0 } },
  });
});

it("two orders at once with the same points: one is placed, the other is POINTS_INSUFFICIENT, and the balance stays at 0 or more", async () => {
  const me = someone();
  const book = await bookWith(2000, 5);
  await put(me, book, 1);
  await withPoints(me, 1000);

  const results = await Promise.all([place(me, undefined, 800), place(me, undefined, 800)]);

  expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([200, 409]);
  expect(await pointsOf(me)).toBe(200);
  // Only the order that was placed holds a book
  expect(await stockOf(book)).toBe(4);
});
